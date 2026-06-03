import { useReadContract } from "wagmi";
import { gameRegistryAbi } from "../abi/gamefi";
import { bscChain } from "../config/chains";
import { contracts } from "../config/contracts";
import { publicGameCatalog, type PublicGameMode } from "../lib/gameCatalog";

type GameConfigResult = { enabled: boolean } | undefined;

function isEnabled(config: GameConfigResult) {
  return Boolean(config?.enabled);
}

export function useGameAvailability() {
  const spaceConfig = useReadContract({
    address: contracts.gameRegistry,
    chainId: bscChain.id,
    abi: gameRegistryAbi,
    functionName: "getGame",
    args: [publicGameCatalog[0].gameId],
    query: {
      enabled: Boolean(contracts.gameRegistry),
    },
  });

  const boxConfig = useReadContract({
    address: contracts.gameRegistry,
    chainId: bscChain.id,
    abi: gameRegistryAbi,
    functionName: "getGame",
    args: [publicGameCatalog[1].gameId],
    query: {
      enabled: Boolean(contracts.gameRegistry),
    },
  });

  const games = {
    space: {
      ...publicGameCatalog[0],
      enabled: isEnabled(spaceConfig.data),
      isLoading: spaceConfig.isPending,
    },
    box: {
      ...publicGameCatalog[1],
      enabled: isEnabled(boxConfig.data),
      isLoading: boxConfig.isPending,
    },
  } satisfies Record<PublicGameMode, { key: PublicGameMode; gameId: `0x${string}`; label: string; description: string; primaryTab: "open" | "space"; enabled: boolean; isLoading: boolean }>;

  const orderedModes = publicGameCatalog
    .map((game) => games[game.key])
    .filter((game) => game.enabled)
    .map((game) => game.key);

  return {
    games,
    orderedModes,
    firstEnabledMode: orderedModes[0],
    isLoading: spaceConfig.isPending || boxConfig.isPending,
    hasNoEnabledGames: !spaceConfig.isPending && !boxConfig.isPending && orderedModes.length === 0,
  };
}
