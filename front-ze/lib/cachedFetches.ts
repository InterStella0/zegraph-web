import { unstable_cache } from 'next/cache';
import { fetchServerUrl, fetchUrl } from '../utils/generalUtils';

/**
 * Cached server-side fetches with request deduplication
 * These deduplicate identical requests across all users
 */

export const getCachedPlayerStats = unstable_cache(
  async (serverId: string) => {
    return fetchServerUrl(serverId, '/players/stats');
  },
  ['player-stats'],
  {
    revalidate: 300, // 5 minutes
    tags: ['player-stats']
  }
);

export const getCachedTopPlayers = unstable_cache(
  async (serverId: string, timeFrame: string = 'all_time') => {
    const params = timeFrame !== 'all_time' ? { time_frame: timeFrame } : {};
    return fetchUrl(`/graph/${serverId}/top_players`, { params });
  },
  ['top-players'],
  {
    revalidate: 300,
    tags: ['top-players']
  }
);
