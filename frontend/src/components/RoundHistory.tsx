"use client";

import { useRoundHistory } from "../hooks/useRound";
import { formatUnits } from "viem";

interface Props {
  currentEpoch?: bigint;
}

export function RoundHistory({ currentEpoch }: Props) {
  const history = useRoundHistory(currentEpoch);

  if (!history.length) return null;

  return (
    <div className="history-panel">
      <div className="history-header">Recent Rounds</div>
      <div className="history-list">
        {history.map(({ epoch, round }) => {
          if (!round || !round.oracleCalled) return (
            <div key={epoch.toString()} className="history-item history-pending">
              <span className="h-epoch">#{epoch.toString()}</span>
              <span className="h-result h-pending">Pending</span>
            </div>
          );

          const upWin  = round.closePrice > round.lockPrice;
          const draw   = round.closePrice === round.lockPrice;

          const result = draw ? "DRAW" : upWin ? "UP" : "DOWN";
          const cls    = draw ? "h-draw" : upWin ? "h-up" : "h-down";
          const icon   = draw ? "●" : upWin ? "▲" : "▼";

          const lockFmt = round.lockPrice
            ? Number(
                formatUnits(
                  round.lockPrice < BigInt(0) ? BigInt(0) : round.lockPrice,
                  8
                )
              ).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })
            : "--";

          const closeFmt = round.closePrice
            ? Number(
                formatUnits(
                  round.closePrice < BigInt(0) ? BigInt(0) : round.closePrice,
                  8
                )
              ).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })
            : "--";

          const poolFmt = Number(
            formatUnits(round.totalAmount, 18)
          ).toFixed(3);

          const priceDiff =
            round.lockPrice > BigInt(0)
              ? (
                  ((Number(round.closePrice) - Number(round.lockPrice)) /
                    Number(round.lockPrice)) *
                  100
                ).toFixed(2)
              : "0";

          return (
            <div key={epoch.toString()} className={`history-item ${cls}`}>
              <span className="h-epoch">#{epoch.toString()}</span>
              <div className="h-prices">
                <span className="h-lock">{lockFmt}</span>
                <span className="h-arrow">→</span>
                <span className="h-close">{closeFmt}</span>
                <span
                  className={`h-pct ${
                    parseFloat(priceDiff) >= 0 ? "h-up" : "h-down"
                  }`}
                >
                  {parseFloat(priceDiff) >= 0 ? "+" : ""}
                  {priceDiff}%
                </span>
              </div>
              <span className="h-pool">{poolFmt} ETH</span>
              <span className={`h-result ${cls}`}>
                {icon} {result}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
