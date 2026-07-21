/**
 * Cache header presets for different data types
 * CDN-aware (Cloudflare/Vercel) with stale-while-revalidate
 */

export const CACHE_HEADERS = {
  // Live data - short cache, background refresh
  LIVE: {
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
  },

  // Player stats - medium cache, tolerate staleness
  PLAYER_STATS: {
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
  },

  // Historical data - long cache
  HISTORICAL: {
    'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
  },

  // Rarely changing data (map images, metadata)
  STATIC: {
    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
  },

  // Never cache (mutations, user-specific data)
  NO_CACHE: {
    'Cache-Control': 'private, no-cache, no-store, must-revalidate',
  },
} as const;

/**
 * Apply cache headers to Next.js Response
 */
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