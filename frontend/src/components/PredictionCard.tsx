"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { useRoundData } from "../hooks/useRound";
import { useCountdown } from "../hooks/useCountdown";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../utils/contract";

export function PredictionCard() {
  const { address, isConnected } = useAccount();
  const { round, epoch, btcPrice, totalPool, upPool, downPool, upMultiplier, downMultiplier, isBettable, lockTimestamp, isLoading, refetch } = useRoundData();
const countdown = useCountdown(lockTimestamp);

  const [betAmount, setBetAmount] = useState("0.01");
  const [betError, setBetError] = useState("");

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  function placeBet(position: 0 | 1) {
    setBetError("");
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < 0.001) {
      setBetError("Minimum bet is 0.001 ETH");
      return;
    }
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "bet",
      args: [position],
      value: parseEther(betAmount),
    });
  }

  const totalPoolNum = parseFloat(totalPool);
  const upPoolNum = parseFloat(upPool);
  const downPoolNum = parseFloat(downPool);
  const upPct = totalPoolNum > 0 ? (upPoolNum / totalPoolNum) * 100 : 50;
  const downPct = 100 - upPct;

  return (
    <div className="card">
      {/* Header */}
      <div className="card-header">
        <span className="epoch-badge">Round #{epoch?.toString() ?? "--"}</span>
        <span className={`status-pill ${isBettable ? "status-open" : "status-locked"}`}>
          {isBettable ? "● OPEN" : "● LOCKED"}
        </span>
      </div>

      {/* BTC Price */}
      <div className="price-display">
        <div className="price-label">BTC / USD</div>
        <div className="price-value">{isLoading ? "Loading..." : btcPrice}</div>
      </div>

      {/* Timer */}
      <div className="timer-section">
        <div className="timer-label">Time to lock</div>
        <div className="timer-display">
          <span className="timer-digit">{countdown.minutes}</span>
          <span className="timer-colon">:</span>
          <span className="timer-digit">{countdown.seconds}</span>
        </div>
        <div className="timer-bar-track">
          <div className="timer-bar-fill" style={{ width: `${countdown.pct}%` }} />
        </div>
      </div>

      {/* Pool breakdown */}
      <div className="pool-row">
        <div className="pool-side pool-up">
          <div className="pool-label">UP Pool</div>
          <div className="pool-amount">{upPool} ETH</div>
          <div className="pool-mult">{upMultiplier}×</div>
        </div>
        <div className="pool-divider">
          <div className="pool-bar-track">
            <div className="pool-bar-up" style={{ width: `${upPct}%` }} />
            <div className="pool-bar-down" style={{ width: `${downPct}%` }} />
          </div>
          <div className="pool-total">{totalPool} ETH total</div>
        </div>
        <div className="pool-side pool-down">
          <div className="pool-label">DOWN Pool</div>
          <div className="pool-amount">{downPool} ETH</div>
          <div className="pool-mult">{downMultiplier}×</div>
        </div>
      </div>

      {/* Bet input */}
      <div className="bet-input-row">
        <label className="bet-label">Bet Amount (ETH)</label>
        <input
          className="bet-input"
          type="number"
          min="0.001"
          step="0.001"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={!isBettable || !isConnected}
        />
        {betError && <div className="bet-error">{betError}</div>}
      </div>

      {/* Bet buttons */}
      {isConnected ? (
        <div className="bet-buttons">
          <button
            className="btn btn-up"
            onClick={() => placeBet(0)}
            disabled={!isBettable || isPending || isConfirming}
          >
            {isPending || isConfirming ? "Confirming..." : "▲ BET UP"}
          </button>
          <button
            className="btn btn-down"
            onClick={() => placeBet(1)}
            disabled={!isBettable || isPending || isConfirming}
          >
            {isPending || isConfirming ? "Confirming..." : "▼ BET DOWN"}
          </button>
        </div>
      ) : (
        <div className="connect-prompt">Connect wallet to play</div>
      )}

      {isConfirmed && (
        <div className="tx-success">✓ Bet placed successfully</div>
      )}

      {!isBettable && !isLoading && (
        <div className="locked-note">Betting is locked for this round. Next round opens soon.</div>
      )}
    </div>
  );
        }
