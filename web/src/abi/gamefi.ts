export const referralRegistryAbi = [
  {
    type: "function",
    name: "referrerOf",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getReferralStats",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "boundReferrer", type: "address" },
      { name: "inviteeCount", type: "uint256" },
      { name: "cumulativeRewards", type: "uint256" },
    ],
  },
] as const;

export const gameManagerAbi = [
  {
    type: "function",
    name: "placeBet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "bytes32" },
      { name: "wager", type: "uint256" },
      { name: "referrerHint", type: "address" },
      { name: "gameData", type: "bytes" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "refundPendingBet",
    stateMutability: "nonpayable",
    inputs: [{ name: "betId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pendingBetOf",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingBets",
    stateMutability: "view",
    inputs: [{ name: "betId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "gameId", type: "bytes32" },
      { name: "referrer", type: "address" },
      { name: "wager", type: "uint96" },
      { name: "maxProfit", type: "uint96" },
      { name: "placedAt", type: "uint40" },
      { name: "requestId", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "gameData", type: "bytes" }
    ],
  },
  {
    type: "event",
    name: "BetSettled",
    inputs: [
      { name: "betId", type: "uint256", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "player", type: "address" },
      { name: "won", type: "bool" },
      { name: "grossProfit", type: "uint256" },
      { name: "playerPayout", type: "uint256" },
      { name: "burnAmount", type: "uint256" },
      { name: "incomeAmount", type: "uint256" },
      { name: "referralAmount", type: "uint256" },
      { name: "resultData", type: "bytes" },
    ],
  },
  {
    type: "event",
    name: "BetRefunded",
    inputs: [
      { name: "betId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
    ],
  },
] as const;

export const incomePoolAbi = [
  {
    type: "function",
    name: "availableFlap",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const nftRevenueDistributorAbi = [
  {
    type: "function",
    name: "currentUtc8DayId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "previewClaim",
    stateMutability: "view",
    inputs: [
      { name: "dayId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "dayId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "claimBatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "dayIds", type: "uint256[]" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "snapshotAndPull",
    stateMutability: "nonpayable",
    inputs: [{ name: "dayId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "snapshots",
    stateMutability: "view",
    inputs: [{ name: "dayId", type: "uint256" }],
    outputs: [
      { name: "snapshotBlock", type: "uint64" },
      { name: "allocationAmount", type: "uint192" },
      { name: "totalUnits", type: "uint192" },
    ],
  },
] as const;

export const accessControlAbi = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "pause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "unpause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;
