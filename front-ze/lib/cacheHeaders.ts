export const CACHE_HEADERS = {
  LIVE: {
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
  },

  PLAYER_STATS: {
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
  },

  HISTORICAL: {
    'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
  },

  STATIC: {
    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
  },

  NO_CACHE: {
    'Cache-Control': 'private, no-cache, no-store, must-revalidate',
  },
} as const;

export function withCacheHeaders(response: Response, preset: keyof typeof CACHE_HEADERS): Response {
  const headers = new Headers(response.headers);
  Object.entries(CACHE_HEADERS[preset]).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}