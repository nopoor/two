import { keccak256, stringToHex } from "viem";

export type PublicGameMode = "box" | "space";

export const mysteryBoxGameId = keccak256(stringToHex("MYSTERY_BOX"));
export const coinFlipGameId = keccak256(stringToHex("COIN_FLIP"));

export const publicGameCatalog = [
  {
    key: "space" as const,
    gameId: coinFlipGameId,
    labelKey: "game.mode.space",
    primaryTab: "space" as const,
  },
  {
    key: "box" as const,
    gameId: mysteryBoxGameId,
    labelKey: "game.mode.box",
    primaryTab: "open" as const,
  },
] satisfies Array<{
  key: PublicGameMode;
  gameId: `0x${string}`;
  labelKey: string;
  primaryTab: "open" | "space";
}>;
