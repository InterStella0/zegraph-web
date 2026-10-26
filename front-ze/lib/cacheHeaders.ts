const CACHE_CONTROL = {
  LIVE: 'public, s-maxage=60, stale-while-revalidate=120',
  PLAYER_STATS: 'public, s-maxage=300, stale-while-revalidate=900',
  HISTORICAL: 'public, s-maxage=900, stale-while-revalidate=3600',
  STATIC: 'public, s-maxage=86400, stale-while-revalidate=604800',
  NO_CACHE: 'private, no-cache, no-store, must-revalidate',
} as const;

export type CachePreset = keyof typeof CACHE_CONTROL;

export function withCacheHeaders(response: Response, preset: CachePreset): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', CACHE_CONTROL[preset]);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
