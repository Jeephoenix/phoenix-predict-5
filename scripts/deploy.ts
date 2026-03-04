import { ethers, network, run } from "hardhat";

/**
 * Chainlink BTC/USD price feed addresses
 * Base Mainnet:  0x64c911996D3c6aC71f9b455B1E8E7266BcfBB8E3
 * Base Sepolia:  0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298
 */
const CHAINLINK_FEEDS: Record<string, string> = {
  "base-mainnet": "0x64c911996D3c6aC71f9b455B1E8E7266BcfBB8E3",
  "base-sepolia": "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298",
  hardhat: "0x0000000000000000000000000000000000000000", // mock in tests
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;

  console.log(`\n[PhoenixPredict5] Deploying to: ${net}`);
  console.log(`Deployer:         ${deployer.address}`);
  console.log(`Balance:          ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  const oracleAddress = CHAINLINK_FEEDS[net];
  if (!oracleAddress || oracleAddress === "0x" + "0".repeat(40)) {
    throw new Error(`No oracle address configured for network: ${net}`);
  }

  // Config
  const FEE_RATE = 200; // 2% in basis points
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT || deployer.address;
  const OWNER = process.env.OWNER_ADDRESS || deployer.address;

  console.log(`Oracle:           ${oracleAddress}`);
  console.log(`Fee rate:         ${FEE_RATE} bps (${FEE_RATE / 100}%)`);
  console.log(`Fee recipient:    ${FEE_RECIPIENT}`);
  console.log(`Owner:            ${OWNER}\n`);

  const Factory = await ethers.getContractFactory("PhoenixPredict5");
  const contract = await Factory.deploy(oracleAddress, FEE_RATE, FEE_RECIPIENT, OWNER);

  console.log(`Deploying... tx: ${contract.deploymentTransaction()?.hash}`);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✅ PhoenixPredict5 deployed at: ${address}`);

  // Verify on Basescan (skip for local)
  if (net !== "hardhat" && net !== "localhost") {
    console.log("\nWaiting 15s before verification...");
    await new Promise((r) => setTimeout(r, 15_000));

    try {
      await run("verify:verify", {
        address,
        constructorArguments: [oracleAddress, FEE_RATE, FEE_RECIPIENT, OWNER],
      });
      console.log("✅ Contract verified on Basescan");
    } catch (e: any) {
      console.warn("Verification failed:", e.message);
    }
  }

  console.log("\n─── Next Steps ───────────────────────────────────────────");
  console.log(`1. Call genesisStartRound() as owner to bootstrap the market`);
  console.log(`2. Set up a keeper to call executeRound() every 5 minutes`);
  console.log(`3. Set up a keeper to call resolveRound() after each round closes`);
  console.log("──────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
