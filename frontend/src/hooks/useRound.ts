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
  rewardBaseCalAmount: bigint;
  rewardAmount: bigint;
  oracleCalled: boolean;
}

export function useRoundData() {
  const base = { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI } as const;

  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...base, functionName: "getCurrentRound" },
      { ...base, functionName: "getLatestPrice"  },
      { ...base, functionName: "currentEpoch"    },
    ],
    query: { refetchInterval: 3_000 },
  });

  const round     = data?.[0]?.result as RoundData | undefined;
  const priceData = data?.[1]?.result as [bigint, bigint] | undefined;
  const epoch     = data?.[2]?.result as bigint | undefined;

  const rawPrice = priceData ? Number(priceData[0]) : 0;

  const btcPrice = rawPrice
    ? Number(formatUnits(BigInt(rawPrice), 8)).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      })
    : "--";

  const lockPrice = round?.lockPrice
    ? Number(formatUnits(round.lockPrice < BigInt(0) ? BigInt(0) : round.lockPrice, 8))
    : 0;

  const currentPriceNum = rawPrice
    ? Number(formatUnits(BigInt(rawPrice), 8))
    : 0;

  const priceChangePct =
    lockPrice > 0 && currentPriceNum > 0
      ? (((currentPriceNum - lockPrice) / lockPrice) * 100).toFixed(3)
      : null;

  const priceChangeDir =
    priceChangePct !== null
      ? parseFloat(priceChangePct) > 0
        ? "up"
        : parseFloat(priceChangePct) < 0
        ? "down"
        : "flat"
      : null;

  const lockPriceFormatted = lockPrice
    ? lockPrice.toLocaleString("en-US", {
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
    round.startTimestamp > BigInt(0) &&
    now >= round.startTimestamp &&
    now < round.lockTimestamp;

  const lockTimestamp = round ? Number(round.lockTimestamp) : 0;

  return {
    round,
    epoch,
    btcPrice,
    lockPrice,
    lockPriceFormatted,
    priceChangePct,
    priceChangeDir,
    totalPool,
    upPool,
    downPool,
    upMultiplier,
    downMultiplier,
    isBettable,
    lockTimestamp,
    isLoading,
  };
}

export function useUserClaimable(
  address?: `0x${string}`,
  epoch?: bigint
) {
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

export function useExitableInfo(
  epoch?: bigint,
  address?: `0x${string}`
) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "exitableInfo",
    args: epoch && address ? [epoch, address] : undefined,
    query: {
      enabled: Boolean(epoch && address),
      refetchInterval: 5_000,
    },
  });
}

export function useRoundHistory(currentEpoch?: bigint) {
  const epochs = currentEpoch
    ? Array.from({ length: 5 }, (_, i) =>
        currentEpoch - BigInt(i + 1)
      ).filter((e) => e > BigInt(0))
    : [];

  const contracts = epochs.map((epoch) => ({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getRound" as const,
    args: [epoch] as const,
  }));

  const { data } = useReadContracts({
    contracts,
    query: { enabled: epochs.length > 0, refetchInterval: 10_000 },
  });

  return epochs.map((epoch, i) => ({
    epoch,
    round: data?.[i]?.result as RoundData | undefined,
  }));
}
