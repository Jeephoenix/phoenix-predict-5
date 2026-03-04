"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { PredictionCard } from "../components/PredictionCard";
import { ClaimPanel } from "../components/ClaimPanel";
import { RoundHistory } from "../components/RoundHistory";
import { useRoundData } from "../hooks/useRound";

function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors }  = useConnect();
  const { disconnect }           = useDisconnect();

  if (isConnected) {
    return (
      <button className="btn-connect" onClick={() => disconnect()}>
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    );
  }

  return (
    <button
      className="btn-connect"
      onClick={() => connect({ connector: connectors[0] })}
    >
      Connect Wallet
    </button>
  );
}

export default function Home() {
  const { epoch } = useRoundData();

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          PHOENIX <span>PREDICT</span> 5
        </div>
        <ConnectButton />
      </header>
      <main className="main-content">
        <PredictionCard />
        <ClaimPanel />
        <RoundHistory currentEpoch={epoch} />
      </main>
    </div>
  );
}
