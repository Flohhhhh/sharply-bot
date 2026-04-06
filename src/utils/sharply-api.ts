import { env } from '@/env';

type FetchOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
};

async function requestSharply<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = new URL(path, env.SHARPLY_API_BASE_URL);
  const method = options.method ?? 'GET';

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.SHARPLY_INTERNAL_API_TOKEN}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Sharply API request failed (${response.status})`);
  }

  return payload as T;
}

export type SharplyGearItem = {
  id: string;
  name: string;
  slug: string;
  brandName: string | null;
  url: string;
};

export type SharplyPriceSummary = {
  item: SharplyGearItem;
  prices: {
    msrpNowUsdCents: number | null;
    msrpAtLaunchUsdCents: number | null;
    mpbMaxPriceUsdCents: number | null;
  };
};

export type SharplyCompareSummary = {
  first: SharplyGearItem | null;
  second: SharplyGearItem | null;
  compareUrl: string | null;
};

export type SharplyLeaderboardRow = {
  name: string;
  score: number;
  reviews: number;
  edits: number;
};

export type SharplyTrendingItem = {
  gearId: string;
  name: string;
  brandName: string | null;
  slug: string;
  url: string;
};

export type SharplyMessageSearchResult =
  | {
      ok: true;
      item: SharplyGearItem;
      tried: string[];
      usedQuery: string;
    }
  | {
      ok: false;
      code: 'EMPTY_MESSAGE' | 'NO_CANDIDATES' | 'NOT_FOUND';
      tried: string[];
    };

export async function searchGear(query: string) {
  const payload = await requestSharply<{ item: SharplyGearItem | null }>(
    '/api/internal/discord/gear/search',
    {
      method: 'POST',
      body: { query }
    }
  );

  return payload.item;
}

export async function fetchGearPriceSummary(query: string) {
  const payload = await requestSharply<{ result: SharplyPriceSummary | null }>(
    '/api/internal/discord/gear/price',
    {
      method: 'POST',
      body: { query }
    }
  );

  return payload.result;
}

export async function fetchCompareSummary(firstQuery: string, secondQuery: string) {
  return requestSharply<SharplyCompareSummary>('/api/internal/discord/compare', {
    method: 'POST',
    body: { firstQuery, secondQuery }
  });
}

export async function fetchTotals() {
  return requestSharply<{
    gearCount: number;
    contributionCount: number;
  }>('/api/internal/discord/totals');
}

export async function fetchLeaderboard() {
  const payload = await requestSharply<{ rows: SharplyLeaderboardRow[] }>(
    '/api/internal/discord/leaderboard'
  );

  return payload.rows;
}

export async function fetchTrending(window: '7d' | '30d') {
  const payload = await requestSharply<{
    items: SharplyTrendingItem[];
    window: '7d' | '30d';
  }>(`/api/internal/discord/trending?window=${window}`);

  return payload;
}

export async function fetchMessageSearch(message: string) {
  return requestSharply<SharplyMessageSearchResult>(
    '/api/internal/discord/message-search-gear',
    {
      method: 'POST',
      body: { message }
    }
  );
}
