import { ethers, network, run } from "hardhat";

const CHAINLINK_FEEDS: Record<string, string> = {
  "base-mainnet": "0x64c911996D3c6aC71f9b455B1E8E7266BcfBB8E3",
  "base-sepolia":  "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298",
  hardhat:         "0x0000000000000000000000000000000000000000",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;

  console.log(`\n[PhoenixPredict5 v2] Deploying to: ${net}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  const oracleAddress = CHAINLINK_FEEDS[net];
  const FEE_RATE      = 200;   // 2%
  const EXIT_PENALTY  = 1000;  // 10%
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT   || deployer.address;
  const OWNER         = process.env.OWNER_ADDRESS   || deployer.address;

  console.log(`Oracle:        ${oracleAddress}`);
  console.log(`Fee rate:      ${FEE_RATE} bps`);
  console.log(`Exit penalty:  ${EXIT_PENALTY} bps`);
  console.log(`Fee recipient: ${FEE_RECIPIENT}`);
  console.log(`Owner:         ${OWNER}\n`);

  const Factory  = await ethers.getContractFactory("PhoenixPredict5");
  const contract = await Factory.deploy(
    oracleAddress,
    FEE_RATE,
    EXIT_PENALTY,
    FEE_RECIPIENT,
    OWNER
  );

  console.log(`Deploying... tx: ${contract.deploymentTransaction()?.hash}`);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✅ PhoenixPredict5 v2 deployed at: ${address}`);

  if (net !== "hardhat" && net !== "localhost") {
    console.log("\nWaiting 15s before verification...");
    await new Promise((r) => setTimeout(r, 15_000));
    try {
      await run("verify:verify", {
        address,
        constructorArguments: [oracleAddress, FEE_RATE, EXIT_PENALTY, FEE_RECIPIENT, OWNER],
      });
      console.log("✅ Verified on Basescan");
    } catch (e: any) {
      console.warn("Verification failed:", e.message);
    }
  }

  console.log("\n─── Next Steps ───────────────────────────────────────");
  console.log(`1. Call genesisStartRound() as owner`);
  console.log(`2. Set up Chainlink Automation keepers`);
  console.log(`3. Update NEXT_PUBLIC_CONTRACT_ADDRESS in Vercel`);
  console.log("──────────────────────────────────────────────────────\n");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
