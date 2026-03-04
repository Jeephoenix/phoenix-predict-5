import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import {
  coinbaseWallet,
  okxWallet,
  metaMaskWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";

const wallets = [
  {
    groupName: "Recommended",
    wallets: [coinbaseWallet, okxWallet, metaMaskWallet],
  },
];

const connectors = connectorsForWallets(wallets, {
  appName: "Phoenix Predict 5",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || "phoenix-predict-5",
});

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors,
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org"),
    [baseSepolia.id]: http("https://sepolia.base.org"),
  },
  ssr: true,
});

export const TARGET_CHAIN = Number(process.env.NEXT_PUBLIC_CHAIN_ID || base.id);
