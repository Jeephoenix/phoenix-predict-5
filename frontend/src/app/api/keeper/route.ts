import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const abi = parseAbi([
  "function executeRound() external",
  "function resolveRound() external",
  "function currentEpoch() external view returns (uint256)",
  "function rounds(uint256) external view returns (uint256 epoch, uint256 startTimestamp, uint256 lockTimestamp, uint256 closeTimestamp, int256 lockPrice, int256 closePrice, uint80 lockOracleId, uint80 closeOracleId, uint256 totalAmount, uint256 upAmount, uint256 downAmount, uint256 rewardBaseCalAmount, uint256 rewardAmount, bool oracleCalled)",
]);

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const RPC = process.env.NEXT_PUBLIC_RPC_URL!;
const PK = process.env.KEEPER_PRIVATE_KEY as `0x${string}`;

export async function GET() {
  try {
    const account = privateKeyToAccount(PK);
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
    const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

    const epoch = await publicClient.readContract({ address: CONTRACT, abi, functionName: "currentEpoch" });
    const round = await publicClient.readContract({ address: CONTRACT, abi, functionName: "rounds", args: [epoch] });

    const now = BigInt(Math.floor(Date.now() / 1000));
    const results: string[] = [];

    // Resolve previous round if ready
    if (epoch > 1n) {
      const prevRound = await publicClient.readContract({ address: CONTRACT, abi, functionName: "rounds", args: [epoch - 1n] });
      if (!prevRound[13] && now >= prevRound[3]) {
        const hash = await walletClient.writeContract({ address: CONTRACT, abi, functionName: "resolveRound" });
        results.push(`resolveRound tx: ${hash}`);
      }
    }

    // Execute new round if lock window passed
    if (now >= round[2] && now <= round[2] + 30n) {
      const hash = await walletClient.writeContract({ address: CONTRACT, abi, functionName: "executeRound" });
      results.push(`executeRound tx: ${hash}`);
    }

    return Response.json({ success: true, results });
  } catch (e: any) {
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}
