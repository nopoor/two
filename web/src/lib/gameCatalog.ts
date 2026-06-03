import { keccak256, stringToHex } from "viem";

export type PublicGameMode = "box" | "space";

export const mysteryBoxGameId = keccak256(stringToHex("MYSTERY_BOX"));
export const coinFlipGameId = keccak256(stringToHex("COIN_FLIP"));

export const publicGameCatalog = [
  {
    key: "space" as const,
    gameId: coinFlipGameId,
    label: "飞船模式",
    description: "首发上线玩法，适合先观察真实投注和波动。",
    primaryTab: "space" as const,
  },
  {
    key: "box" as const,
    gameId: mysteryBoxGameId,
    label: "盲盒模式",
    description: "默认延后开放，由 owner 在后台手动开启。",
    primaryTab: "open" as const,
  },
] satisfies Array<{
  key: PublicGameMode;
  gameId: `0x${string}`;
  label: string;
  description: string;
  primaryTab: "open" | "space";
}>;
