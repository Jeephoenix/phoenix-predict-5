"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PredictionCard } from "../components/PredictionCard";
import { ClaimPanel } from "../components/ClaimPanel";

export default function Home() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          PHOENIX <span>PREDICT</span> 5
        </div>
        <ConnectButton
          showBalance={false}
          chainStatus="icon"
          accountStatus="address"
        />
      </header>

      <main className="main-content">
        <PredictionCard />
        <ClaimPanel />
      </main>
    </div>
  );
}
