export type FeedBoxItem = {
  key: string;
  betId: string;
  player: `0x${string}`;
  playerPayout: string;
  won: boolean;
  outcome: number;
  tierId: "legendary" | "epic" | "rare" | "common" | "empty";
};

export type FeedSpaceItem = {
  key: string;
  betId: string;
  player: `0x${string}`;
  playerPayout: string;
  won: boolean;
  guessUp: boolean;
  landedUp: boolean;
};

export type FeedResponse = {
  latestBlock: string;
  cachedAt: number;
  box: FeedBoxItem[];
  space: FeedSpaceItem[];
};

export async function fetchFeed(limit = 8): Promise<FeedResponse> {
  const response = await fetch(`/api/feed?limit=${limit}`);

  if (!response.ok) {
    throw new Error(`Feed request failed: ${response.status}`);
  }

  return response.json();
}