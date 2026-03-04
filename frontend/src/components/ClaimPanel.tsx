"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from "wagmi";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../utils/contract";
import { useUserRounds } from "../hooks/useRound";
import { formatEther } from "viem";

export function ClaimPanel() {
  const { address, isConnected } = useAccount();
  const { data: userEpochs } = useUserRounds(address);
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Check claimable for each user epoch
  const claimableContracts =
    userEpochs?.map((epoch) => ({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "claimable" as const,
      args: [epoch, address!] as const,
    })) ?? [];

  const { data: claimableResults } = useReadContracts({
    contracts: claimableContracts,
    query: { enabled: Boolean(address && userEpochs?.length) },
  });

  const claimableEpochs =
    userEpochs?.filter((_, i) => claimableResults?.[i]?.result === true) ?? [];

  function handleClaim() {
    if (!claimableEpochs.length) return;
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "claim",
      args: [claimableEpochs],
    });
  }

  if (!isConnected) return null;

  return (
    <div className="claim-panel">
      <div className="claim-header">My Rewards</div>
      {claimableEpochs.length > 0 ? (
        <>
          <div className="claim-info">
            {claimableEpochs.length} round{claimableEpochs.length > 1 ? "s" : ""} ready to claim
            <span className="claim-rounds">
              {claimableEpochs.slice(0, 5).map((e) => `#${e}`).join(", ")}
              {claimableEpochs.length > 5 ? ` +${claimableEpochs.length - 5} more` : ""}
            </span>
          </div>
          <button
            className="btn btn-claim"
            onClick={handleClaim}
            disabled={isPending || isConfirming}
          >
            {isPending || isConfirming ? "Claiming..." : "Claim Rewards"}
          </button>
          {isSuccess && <div className="tx-success">✓ Rewards claimed!</div>}
        </>
      ) : (
        <div className="no-claims">
          {userEpochs?.length ? "No pending rewards" : "No rounds played yet"}
        </div>
      )}
    </div>
  );
}
