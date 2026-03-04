import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { PhoenixPredict5 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// ─── Mock Chainlink Oracle ────────────────────────────────────────────────────

async function deployMockOracle(initialPrice: bigint) {
  const MockOracle = await ethers.getContractFactory("MockV3Aggregator");
  return MockOracle.deploy(8, initialPrice); // 8 decimals like real BTC feed
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROUND_DURATION = 5 * 60; // 300 seconds
const BUFFER = 30;
const MIN_BET = ethers.parseEther("0.001");
const BTC_PRICE = 100_000_00000000n; // $100,000 with 8 decimals

async function deployFixture() {
  const [owner, alice, bob, carol, feeRecipient] = await ethers.getSigners();

  const oracle = await deployMockOracle(BTC_PRICE);
  const oracleAddress = await oracle.getAddress();

  const Factory = await ethers.getContractFactory("PhoenixPredict5");
  const contract = (await Factory.deploy(
    oracleAddress,
    200, // 2%
    feeRecipient.address,
    owner.address
  )) as unknown as PhoenixPredict5;

  return { contract, oracle, owner, alice, bob, carol, feeRecipient };
}

async function bootstrapAndBet(
  contract: PhoenixPredict5,
  oracle: any,
  owner: SignerWithAddress,
  alice: SignerWithAddress,
  bob: SignerWithAddress,
  alicePos: 0 | 1,
  bobPos: 0 | 1,
  closePrice: bigint
) {
  await contract.connect(owner).genesisStartRound();

  // Alice and Bob bet in epoch 1
  await contract.connect(alice).bet(alicePos, { value: ethers.parseEther("1") });
  await contract.connect(bob).bet(bobPos, { value: ethers.parseEther("1") });

  // Advance past lock time
  await time.increase(ROUND_DURATION + 1);

  // Execute round (locks epoch 1, starts epoch 2)
  await contract.connect(owner).executeRound();

  // Advance past close time
  await time.increase(ROUND_DURATION + 1);

  // Update oracle price for resolution
  await oracle.updateAnswer(closePrice);

  // Resolve epoch 1
  await contract.connect(owner).resolveRound();

  return { epoch: 1n };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PhoenixPredict5", () => {
  // ── Deployment ──────────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("sets oracle, fee rate, fee recipient, owner correctly", async () => {
      const { contract, oracle, owner, feeRecipient } = await deployFixture();
      expect(await contract.oracle()).to.equal(await oracle.getAddress());
      expect(await contract.feeRate()).to.equal(200n);
      expect(await contract.feeRecipient()).to.equal(feeRecipient.address);
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("starts at epoch 0", async () => {
      const { contract } = await deployFixture();
      expect(await contract.currentEpoch()).to.equal(0n);
    });
  });

  // ── Genesis ─────────────────────────────────────────────────────────────────
  describe("genesisStartRound", () => {
    it("sets currentEpoch to 1", async () => {
      const { contract, owner } = await deployFixture();
      await contract.connect(owner).genesisStartRound();
      expect(await contract.currentEpoch()).to.equal(1n);
    });

    it("reverts if called twice", async () => {
      const { contract, owner } = await deployFixture();
      await contract.connect(owner).genesisStartRound();
      await expect(contract.connect(owner).genesisStartRound()).to.be.revertedWith("Already started");
    });

    it("reverts if called by non-owner", async () => {
      const { contract, alice } = await deployFixture();
      await expect(contract.connect(alice).genesisStartRound()).to.be.reverted;
    });
  });

  // ── Betting ─────────────────────────────────────────────────────────────────
  describe("bet()", () => {
    it("allows UP and DOWN bets during betting window", async () => {
      const { contract, owner, alice, bob } = await deployFixture();
      await contract.connect(owner).genesisStartRound();

      await expect(
        contract.connect(alice).bet(0, { value: MIN_BET }) // UP
      ).to.emit(contract, "BetPlaced");

      await expect(
        contract.connect(bob).bet(1, { value: MIN_BET }) // DOWN
      ).to.emit(contract, "BetPlaced");
    });

    it("reverts if bet below minimum", async () => {
      const { contract, owner, alice } = await deployFixture();
      await contract.connect(owner).genesisStartRound();
      await expect(
        contract.connect(alice).bet(0, { value: ethers.parseEther("0.0001") })
      ).to.be.revertedWithCustomError(contract, "BetTooSmall");
    });

    it("reverts if user bets twice in same round", async () => {
      const { contract, owner, alice } = await deployFixture();
      await contract.connect(owner).genesisStartRound();
      await contract.connect(alice).bet(0, { value: MIN_BET });
      await expect(
        contract.connect(alice).bet(1, { value: MIN_BET })
      ).to.be.revertedWithCustomError(contract, "AlreadyBet");
    });

    it("reverts after lock time", async () => {
      const { contract, owner, alice } = await deployFixture();
      await contract.connect(owner).genesisStartRound();
      await time.increase(ROUND_DURATION + 1);
      await expect(
        contract.connect(alice).bet(0, { value: MIN_BET })
      ).to.be.revertedWithCustomError(contract, "RoundNotBettable");
    });

    it("updates round amounts correctly", async () => {
      const { contract, owner, alice, bob } = await deployFixture();
      await contract.connect(owner).genesisStartRound();

      const upAmt = ethers.parseEther("2");
      const downAmt = ethers.parseEther("3");

      await contract.connect(alice).bet(0, { value: upAmt });
      await contract.connect(bob).bet(1, { value: downAmt });

      const round = await contract.getCurrentRound();
      expect(round.upAmount).to.equal(upAmt);
      expect(round.downAmount).to.equal(downAmt);
      expect(round.totalAmount).to.equal(upAmt + downAmt);
    });
  });

  // ── Resolution & Payout ──────────────────────────────────────────────────────
  describe("Resolution & Payout", () => {
    it("UP winners claim correct payout when price rises", async () => {
      const { contract, oracle, owner, alice, bob, feeRecipient } = await deployFixture();

      // Alice UP, Bob DOWN, price goes UP
      const closePrice = BTC_PRICE + 1000_00000000n;
      await bootstrapAndBet(contract, oracle, owner, alice, bob, 0, 1, closePrice);

      const aliceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await contract.connect(alice).claim([1n]);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const aliceAfter = await ethers.provider.getBalance(alice.address);

      // Alice bet 1 ETH, total pool = 2 ETH, fee = 2% → reward pool = 1.96 ETH
      // Alice wins entire reward pool (she's the only winner)
      const expectedReward = ethers.parseEther("1.96");
      expect(aliceAfter - aliceBefore + gasUsed).to.be.closeTo(expectedReward, ethers.parseEther("0.001"));
    });

    it("DOWN winners claim correct payout when price falls", async () => {
      const { contract, oracle, owner, alice, bob } = await deployFixture();

      const closePrice = BTC_PRICE - 1000_00000000n;
      await bootstrapAndBet(contract, oracle, owner, alice, bob, 0, 1, closePrice);

      const bobBefore = await ethers.provider.getBalance(bob.address);
      const tx = await contract.connect(bob).claim([1n]);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const bobAfter = await ethers.provider.getBalance(bob.address);

      const expectedReward = ethers.parseEther("1.96");
      expect(bobAfter - bobBefore + gasUsed).to.be.closeTo(expectedReward, ethers.parseEther("0.001"));
    });

    it("full refund when price does not change", async () => {
      const { contract, oracle, owner, alice, bob } = await deployFixture();

      // Same price = draw
      await bootstrapAndBet(contract, oracle, owner, alice, bob, 0, 1, BTC_PRICE);

      const aliceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await contract.connect(alice).claim([1n]);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const aliceAfter = await ethers.provider.getBalance(alice.address);

      // Full refund, no fee
      expect(aliceAfter - aliceBefore + gasUsed).to.be.closeTo(
        ethers.parseEther("1"),
        ethers.parseEther("0.001")
      );
    });

    it("full refund when one side has no bets", async () => {
      const { contract, oracle, owner, alice } = await deployFixture();
      await contract.connect(owner).genesisStartRound();

      // Only Alice bets UP, no one bets DOWN
      await contract.connect(alice).bet(0, { value: ethers.parseEther("1") });
      await time.increase(ROUND_DURATION + 1);
      await contract.connect(owner).executeRound();
      await time.increase(ROUND_DURATION + 1);
      await oracle.updateAnswer(BTC_PRICE + 1000_00000000n);
      await contract.connect(owner).resolveRound();

      const aliceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await contract.connect(alice).claim([1n]);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const aliceAfter = await ethers.provider.getBalance(alice.address);

      expect(aliceAfter - aliceBefore + gasUsed).to.be.closeTo(
        ethers.parseEther("1"),
        ethers.parseEther("0.001")
      );
    });

    it("reverts if loser tries to claim", async () => {
      const { contract, oracle, owner, alice, bob } = await deployFixture();
      const closePrice = BTC_PRICE + 1000_00000000n;
      await bootstrapAndBet(contract, oracle, owner, alice, bob, 0, 1, closePrice);

      await expect(contract.connect(bob).claim([1n])).to.be.revertedWithCustomError(
        contract,
        "NothingToClaim"
      );
    });

    it("cannot claim twice", async () => {
      const { contract, oracle, owner, alice, bob } = await deployFixture();
      const closePrice = BTC_PRICE + 1000_00000000n;
      await bootstrapAndBet(contract, oracle, owner, alice, bob, 0, 1, closePrice);
      await contract.connect(alice).claim([1n]);
      await expect(contract.connect(alice).claim([1n])).to.be.revertedWithCustomError(
        contract,
        "NothingToClaim"
      );
    });
  });

  // ── Fee Collection ──────────────────────────────────────────────────────────
  describe("Fee Collection", () => {
    it("accumulates treasury correctly", async () => {
      const { contract, oracle, owner, alice, bob } = await deployFixture();
      const closePrice = BTC_PRICE + 1000_00000000n;
      await bootstrapAndBet(contract, oracle, owner, alice, bob, 0, 1, closePrice);

      // Total 2 ETH, 2% fee = 0.04 ETH
      expect(await contract.treasuryAmount()).to.be.closeTo(
        ethers.parseEther("0.04"),
        ethers.parseEther("0.001")
      );
    });

    it("feeRecipient can claim treasury", async () => {
      const { contract, oracle, owner, alice, bob, feeRecipient } = await deployFixture();
      const closePrice = BTC_PRICE + 1000_00000000n;
      await bootstrapAndBet(contract, oracle, owner, alice, bob, 0, 1, closePrice);

      const before = await ethers.provider.getBalance(feeRecipient.address);
      await contract.connect(feeRecipient).claimTreasury();
      const after = await ethers.provider.getBalance(feeRecipient.address);

      expect(after).to.be.gt(before);
    });
  });

  // ── Admin ────────────────────────────────────────────────────────────────────
  describe("Admin", () => {
    it("owner can update fee rate within limit", async () => {
      const { contract, owner } = await deployFixture();
      await contract.connect(owner).setFeeRate(500);
      expect(await contract.feeRate()).to.equal(500n);
    });

    it("reverts if fee rate exceeds cap", async () => {
      const { contract, owner } = await deployFixture();
      await expect(contract.connect(owner).setFeeRate(1001)).to.be.revertedWithCustomError(
        contract,
        "InvalidFeeRate"
      );
    });

    it("owner can pause and unpause", async () => {
      const { contract, owner, alice } = await deployFixture();
      await contract.connect(owner).genesisStartRound();
      await contract.connect(owner).pause();
      await expect(
        contract.connect(alice).bet(0, { value: MIN_BET })
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");

      await contract.connect(owner).unpause();
      await expect(
        contract.connect(alice).bet(0, { value: MIN_BET })
      ).to.emit(contract, "BetPlaced");
    });

    it("non-owner cannot pause", async () => {
      const { contract, alice } = await deployFixture();
      await expect(contract.connect(alice).pause()).to.be.reverted;
    });
  });

  // ── Security ─────────────────────────────────────────────────────────────────
  describe("Security", () => {
    it("rejects direct ETH transfers", async () => {
      const { contract, alice } = await deployFixture();
      await expect(
        alice.sendTransaction({ to: await contract.getAddress(), value: MIN_BET })
      ).to.be.revertedWith("Use bet()");
    });
  });
});
