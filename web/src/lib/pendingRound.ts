export type PendingRoundGame = "coin-flip" | "mystery-box";

export type PendingRoundRecord = {
  wallet: `0x${string}`;
  game: PendingRoundGame;
  betId: string;
  fromBlock: string;
  txHash?: `0x${string}`;
  createdAt: number;
  guessUp?: boolean;
};

function buildKey(wallet: string, game: PendingRoundGame) {
  return `dividend-bank:pending-round:${wallet.toLowerCase()}:${game}`;
}

export function savePendingRound(record: PendingRoundRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(buildKey(record.wallet, record.game), JSON.stringify(record));
}

export function readPendingRound(wallet: string, game: PendingRoundGame): PendingRoundRecord | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(buildKey(wallet, game));
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as PendingRoundRecord;
  } catch {
    return undefined;
  }
}

export function clearPendingRound(wallet: string, game: PendingRoundGame) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(buildKey(wallet, game));
}