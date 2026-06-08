import {
  createPublicClient,
  decodeAbiParameters,
  http,
  keccak256,
  parseAbiItem,
  stringToHex,
} from "viem";
import { bsc } from "viem/chains";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const FEED_CHUNK_SIZE = 500n;
const FEED_MIN_CHUNK_SIZE = 50n;
const FEED_CACHE_SECONDS = Number(process.env.FEED_CACHE_SECONDS ?? "10");
const FEED_MAX_LOOKBACK_BLOCKS = BigInt(process.env.FEED_MAX_LOOKBACK_BLOCKS ?? "100000");

const mysteryBoxGameId = keccak256(stringToHex("MYSTERY_BOX"));
const coinFlipGameId = keccak256(stringToHex("COIN_FLIP"));

const betSettledEvent = parseAbiItem(
  "event BetSettled(uint256 indexed betId, uint256 indexed requestId, bytes32 indexed gameId, address player, bool won, uint256 grossProfit, uint256 playerPayout, uint256 burnAmount, uint256 incomeAmount, uint256 referralAmount, bytes resultData)"
);

let memoryCache = {
  key: "",
  expiresAt: 0,
  payload: null,
};

function parseLimit(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function getClient() {
  const rpcUrl = process.env.BSC_RPC_URL_SERVER || process.env.VITE_BSC_RPC_URL;
  const gameManager = process.env.VITE_GAME_MANAGER_ADDRESS;

  if (!rpcUrl) {
    throw new Error("Missing BSC_RPC_URL_SERVER");
  }

  if (!gameManager) {
    throw new Error("Missing VITE_GAME_MANAGER_ADDRESS");
  }

  return {
    client: createPublicClient({
      chain: bsc,
      transport: http(rpcUrl),
    }),
    gameManager,
  };
}

async function getLogsAdaptive({ client, gameManager, gameId, latestBlock, limit }) {
  const minBlock = latestBlock > FEED_MAX_LOOKBACK_BLOCKS
    ? latestBlock - FEED_MAX_LOOKBACK_BLOCKS
    : 0n;

  let toBlock = latestBlock;
  let chunkSize = FEED_CHUNK_SIZE;
  let collected = [];

  while (toBlock >= minBlock && collected.length < limit) {
    const rawFromBlock = toBlock >= chunkSize - 1n ? toBlock - chunkSize + 1n : 0n;
    const fromBlock = rawFromBlock > minBlock ? rawFromBlock : minBlock;

    try {
      const chunkLogs = await client.getLogs({
        address: gameManager,
        event: betSettledEvent,
        args: { gameId },
        fromBlock,
        toBlock,
      });

      collected = [...chunkLogs, ...collected];

      if (chunkSize < FEED_CHUNK_SIZE) {
        chunkSize = FEED_CHUNK_SIZE;
      }

      if (fromBlock === minBlock) {
        break;
      }

      toBlock = fromBlock - 1n;
    } catch (error) {
      if (chunkSize <= FEED_MIN_CHUNK_SIZE) {
        throw error;
      }

      chunkSize = chunkSize / 2n >= FEED_MIN_CHUNK_SIZE
        ? chunkSize / 2n
        : FEED_MIN_CHUNK_SIZE;
    }
  }

  return collected.slice(-limit);
}

function decodeBoxLogs(logs) {
  const tierIdMap = ["legendary", "epic", "rare", "common", "empty"];

  return logs
    .reverse()
    .flatMap((log) => {
      if (
        !log.args.resultData ||
        log.args.playerPayout === undefined ||
        log.args.player === undefined ||
        log.args.won === undefined ||
        log.args.betId === undefined
      ) {
        return [];
      }

      const [tierIndex, outcome] = decodeAbiParameters(
        [
          { name: "tierId", type: "uint8" },
          { name: "outcome", type: "uint16" },
          { name: "grossMultiplierBps", type: "uint32" },
        ],
        log.args.resultData
      );

      return [{
        key: log.args.betId.toString(),
        betId: log.args.betId.toString(),
        player: log.args.player,
        playerPayout: log.args.playerPayout.toString(),
        won: log.args.won,
        outcome: Number(outcome),
        tierId: tierIdMap[Number(tierIndex)] ?? "empty",
      }];
    });
}

function decodeSpaceLogs(logs) {
  return logs
    .reverse()
    .flatMap((log) => {
      if (
        !log.args.resultData ||
        log.args.playerPayout === undefined ||
        log.args.player === undefined ||
        log.args.won === undefined ||
        log.args.betId === undefined
      ) {
        return [];
      }

      const [guessUp, landedUp] = decodeAbiParameters(
        [
          { name: "guessHeads", type: "bool" },
          { name: "landedHeads", type: "bool" },
        ],
        log.args.resultData
      );

      return [{
        key: log.args.betId.toString(),
        betId: log.args.betId.toString(),
        player: log.args.player,
        playerPayout: log.args.playerPayout.toString(),
        won: log.args.won,
        guessUp,
        landedUp,
      }];
    });
}

export default async function handler(req, res) {
  try {
    const limit = parseLimit(req.query.limit);
    const cacheKey = `limit:${limit}`;

    if (memoryCache.payload && memoryCache.key === cacheKey && memoryCache.expiresAt > Date.now()) {
      res.setHeader(
        "Cache-Control",
        `public, max-age=0, s-maxage=${FEED_CACHE_SECONDS}, stale-while-revalidate=30`
      );
      return res.status(200).json(memoryCache.payload);
    }

    const { client, gameManager } = getClient();
    const latestBlock = await client.getBlockNumber();

    const [boxLogs, spaceLogs] = await Promise.all([
      getLogsAdaptive({
        client,
        gameManager,
        gameId: mysteryBoxGameId,
        latestBlock,
        limit,
      }),
      getLogsAdaptive({
        client,
        gameManager,
        gameId: coinFlipGameId,
        latestBlock,
        limit,
      }),
    ]);

    const payload = {
      latestBlock: latestBlock.toString(),
      cachedAt: Date.now(),
      box: decodeBoxLogs(boxLogs),
      space: decodeSpaceLogs(spaceLogs),
    };

    memoryCache = {
      key: cacheKey,
      payload,
      expiresAt: Date.now() + FEED_CACHE_SECONDS * 1000,
    };

    res.setHeader(
      "Cache-Control",
      `public, max-age=0, s-maxage=${FEED_CACHE_SECONDS}, stale-while-revalidate=30`
    );

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Failed to load feed", error);
    return res.status(500).json({
      error: "failed_to_load_feed",
    });
  }
}