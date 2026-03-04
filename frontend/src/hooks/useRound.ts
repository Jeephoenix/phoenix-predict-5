import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../utils/contract";
import { formatUnits } from "viem";

export interface RoundData {
  epoch: bigint;
  startTimestamp: bigint;
  lockTimestamp: bigint;
  closeTimestamp: bigint;
  lockPrice: bigint;
  closePrice: bigint;
  totalAmount: bigint;
  upAmount: bigint;
  downAmount: bigint;
  oracleCalled: boolean;
}

export function useRoundData() {
  const base = { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI } as const;

  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { ...base, functionName: "getCurrentRound" },
      { ...base, functionName: "getLatestPrice" },
      { ...base, functionName: "currentEpoch" },
    ],
    query: { refetchInterval: 5_000 },
  });

  const round = data?.[0]?.result as RoundData | undefined;
  const priceData = data?.[1]?.result as [bigint, bigint] | undefined;
  const epoch = data?.[2]?.result as bigint | undefined;

  const btcPrice = priceData
    ? Number(formatUnits(priceData[0], 8)).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      })
    : "--";

  const totalPool = round
    ? Number(formatUnits(round.totalAmount, 18)).toFixed(4)
    : "0.0000";

  const upPool = round
    ? Number(formatUnits(round.upAmount, 18)).toFixed(4)
    : "0.0000";

  const downPool = round
    ? Number(formatUnits(round.downAmount, 18)).toFixed(4)
    : "0.0000";

  // Payout multiplier for UP: total / upAmount (less fee ~2%)
  const upMultiplier =
    round && round.upAmount > BigInt(0)
      ? ((Number(round.totalAmount) * 0.98) / Number(round.upAmount)).toFixed(2)
      : "--";

  const downMultiplier =
    round && round.downAmount > BigInt(0)
      ? ((Number(round.totalAmount) * 0.98) / Number(round.downAmount)).toFixed(2)
      : "--";

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isBettable =
    round &&
    round.startTimestamp > 0n &&
    now >= round.startTimestamp &&
    now < round.lockTimestamp;

  const secondsLeft =
    round && isBettable ? Number(round.lockTimestamp - now) : 0;

  return {
    round,
    epoch,
    btcPrice,
    totalPool,
    upPool,
    downPool,
    upMultiplier,
    downMultiplier,
    isBettable,
    secondsLeft,
    isLoading,
    refetch,
  };
}

export function useUserClaimable(address?: `0x${string}`, epoch?: bigint) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "claimable",
    args: epoch && address ? [epoch, address] : undefined,
    query: { enabled: Boolean(address && epoch) },
  });
}

export function useUserRounds(address?: `0x${string}`) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getUserRounds",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });
}
