export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const CONTRACT_ABI = [
  // ─── Views ───────────────────────────────────────────────────────────────
  {
    name: "getCurrentRound",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "epoch", type: "uint256" },
          { name: "startTimestamp", type: "uint256" },
          { name: "lockTimestamp", type: "uint256" },
          { name: "closeTimestamp", type: "uint256" },
          { name: "lockPrice", type: "int256" },
          { name: "closePrice", type: "int256" },
          { name: "lockOracleId", type: "uint80" },
          { name: "closeOracleId", type: "uint80" },
          { name: "totalAmount", type: "uint256" },
          { name: "upAmount", type: "uint256" },
          { name: "downAmount", type: "uint256" },
          { name: "rewardBaseCalAmount", type: "uint256" },
          { name: "rewardAmount", type: "uint256" },
          { name: "oracleCalled", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "currentEpoch",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getLatestPrice",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "price", type: "int256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
  {
    name: "getUserRounds",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    name: "claimable",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "epoch", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "ledger",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "epoch", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "position", type: "uint8" },
      { name: "amount", type: "uint256" },
      { name: "claimed", type: "bool" },
    ],
  },
  {
    name: "rounds",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "epoch", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "epoch", type: "uint256" },
          { name: "startTimestamp", type: "uint256" },
          { name: "lockTimestamp", type: "uint256" },
          { name: "closeTimestamp", type: "uint256" },
          { name: "lockPrice", type: "int256" },
          { name: "closePrice", type: "int256" },
          { name: "lockOracleId", type: "uint80" },
          { name: "closeOracleId", type: "uint80" },
          { name: "totalAmount", type: "uint256" },
          { name: "upAmount", type: "uint256" },
          { name: "downAmount", type: "uint256" },
          { name: "rewardBaseCalAmount", type: "uint256" },
          { name: "rewardAmount", type: "uint256" },
          { name: "oracleCalled", type: "bool" },
        ],
      },
    ],
  },
  // ─── Write ───────────────────────────────────────────────────────────────
  {
    name: "bet",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "position", type: "uint8" }],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "epochs", type: "uint256[]" }],
    outputs: [],
  },
  // ─── Events ──────────────────────────────────────────────────────────────
  {
    name: "BetPlaced",
    type: "event",
    inputs: [
      { name: "epoch", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "position", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RoundResolved",
    type: "event",
    inputs: [
      { name: "epoch", type: "uint256", indexed: true },
      { name: "oracleRoundId", type: "uint80", indexed: true },
      { name: "price", type: "int256", indexed: false },
      { name: "result", type: "uint8", indexed: false },
    ],
  },
] as const;
