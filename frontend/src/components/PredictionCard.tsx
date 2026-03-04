"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { useRoundData, useExitableInfo } from "../hooks/useRound";
import { useCountdown } from "../hooks/useCountdown";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../utils/contract";

export function PredictionCard() {
  const { address, isConnected } = useAccount();
  const {
    round, epoch, btcPrice, lockPriceFormatted, priceChangePct, priceChangeDir,
    totalPool, upPool, downPool, upMultiplier, downMultiplier,
    isBettable, lockTimestamp, isLoading,
  } = useRoundData();

  const countdown = useCountdown(lockTimestamp);

  const [betAmount, setBetAmount] = useState("0.01");
  const [betError,  setBetError]  = useState("");

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const { data: exitInfo } = useExitableInfo(epoch, address);
  const canExit     = exitInfo?.[0] ?? false;
  const exitRefund  = exitInfo?.[1] ? formatEther(exitInfo[1]) : "0";
  const exitPenalty = exitInfo?.[2] ? formatEther(exitInfo[2]) : "0";

  const {
    writeContract: writeExit,
    data: exitHash,
    isPending: exitPending,
  } = useWriteContract();
  const { isLoading: exitConfirming, isSuccess: exitConfirmed } =
    useWaitForTransactionReceipt({ hash: exitHash });

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

  function handleEarlyExit() {
    if (!epoch) return;
    writeExit({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "exitEarly",
      args: [epoch],
    });
  }

  const totalPoolNum = parseFloat(totalPool);
  const upPoolNum    = parseFloat(upPool);
  const upPct        = totalPoolNum > 0 ? (upPoolNum / totalPoolNum) * 100 : 50;
  const downPct      = 100 - upPct;

  const isLocked = !isBettable && round && round.startTimestamp > BigInt(0);

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

        {priceChangePct !== null && isLocked && (
          <div className={`price-change price-change-${priceChangeDir}`}>
            {parseFloat(priceChangePct) > 0
              ? "▲"
              : parseFloat(priceChangePct) < 0
              ? "▼"
              : "●"}{" "}
            {Math.abs(parseFloat(priceChangePct))}% from lock
          </div>
        )}
      </div>

      {/* Price to Beat */}
      {isLocked && lockPriceFormatted !== "--" && (
        <div className="price-to-beat">
          <div className="ptb-label">Price to Beat</div>
          <div className="ptb-row">
            <div className="ptb-side ptb-up">
              <span className="ptb-icon">▲</span>
              <span>UP needs &gt; {lockPriceFormatted}</span>
            </div>
            <div className="ptb-divider">|</div>
            <div className="ptb-side ptb-down">
              <span className="ptb-icon">▼</span>
              <span>DOWN needs &lt; {lockPriceFormatted}</span>
            </div>
          </div>
        </div>
      )}

      {/* Timer */}
      <div className="timer-section">
        <div className="timer-label">
          {isBettable ? "Time to lock" : "Round locked"}
        </div>
        <div className="timer-display">
          <span className="timer-digit">{countdown.minutes}</span>
          <span className="timer-colon">:</span>
          <span className="timer-digit">{countdown.seconds}</span>
        </div>
        <div className="timer-bar-track">
          <div
            className="timer-bar-fill"
            style={{ width: `${countdown.pct}%` }}
          />
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
            <div className="pool-bar-up"   style={{ width: `${upPct}%`   }} />
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
      {isConnected && isBettable && (
        <>
          <div className="bet-input-row">
            <label className="bet-label">Bet Amount (ETH)</label>
            <input
              className="bet-input"
              type="number"
              min="0.001"
              step="0.001"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
            />
            {betError && <div className="bet-error">{betError}</div>}
          </div>
          <div className="bet-buttons">
            <button
              className="btn btn-up"
              onClick={() => placeBet(0)}
              disabled={isPending || isConfirming}
            >
              {isPending || isConfirming ? "Confirming..." : "▲ BET UP"}
            </button>
            <button
              className="btn btn-down"
              onClick={() => placeBet(1)}
              disabled={isPending || isConfirming}
            >
              {isPending || isConfirming ? "Confirming..." : "▼ BET DOWN"}
            </button>
          </div>
          {isConfirmed && (
            <div className="tx-success">✓ Bet placed successfully</div>
          )}
        </>
      )}

      {/* Early Exit */}
      {isConnected && canExit && (
        <div className="early-exit-panel">
          <div className="exit-header">Early Exit Available</div>
          <div className="exit-info">
            <span>
              Refund:{" "}
              <strong>{parseFloat(exitRefund).toFixed(4)} ETH</strong>
            </span>
            <span>
              Penalty:{" "}
              <strong className="exit-penalty">
                {parseFloat(exitPenalty).toFixed(4)} ETH
              </strong>
            </span>
          </div>
          <button
            className="btn btn-exit"
            onClick={handleEarlyExit}
            disabled={exitPending || exitConfirming}
          >
            {exitPending || exitConfirming
              ? "Processing..."
              : "Exit Position (10% fee)"}
          </button>
          {exitConfirmed && (
            <div className="tx-success">✓ Position exited</div>
          )}
        </div>
      )}

      {!isConnected && (
        <div className="connect-prompt">Connect wallet to play</div>
      )}

      {isLocked && (
        <div className="locked-note">
          Betting locked. Waiting for next round...
        </div>
      )}
    </div>
  );
}
