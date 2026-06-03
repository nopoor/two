import { keccak256, stringToHex } from "viem";

export type PublicGameMode = "box" | "space";

export const mysteryBoxGameId = keccak256(stringToHex("MYSTERY_BOX"));
export const coinFlipGameId = keccak256(stringToHex("COIN_FLIP"));

export const publicGameCatalog = [
  {
    key: "space" as const,
    gameId: coinFlipGameId,
    label: "飞船模式",
    primaryTab: "space" as const,
  },
  {
    key: "box" as const,
    gameId: mysteryBoxGameId,
    label: "盲盒模式",
    primaryTab: "open" as const,
  },
] satisfies Array<{
  key: PublicGameMode;
  gameId: `0x${string}`;
  label: string;
  primaryTab: "open" | "space";
}>;
