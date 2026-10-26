const SUPPORTERS_ROOT = 'https://queeniemella.cc/api/supporters';
export const DONOR_BANNER_DISMISSED = 'donor_banner_dismissed';

export interface TopSupporter {
  rank: number;
  name: string;
  message: string | null;
}

export interface RecentSupporter {
  name: string;
  message: string | null;
  created_at: string;
}

export interface AllSupporters {
  names: string[];
  anonymous: number;
}

export interface DonorBannerData {
  latestId: string;
  names: string;
  remaining: number;
}

// Supporter data is decoration: any failure or unexpected shape yields the fallback.
async function fetchSupporters<T>(path: string, parse: (json: any) => T, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${SUPPORTERS_ROOT}${path}`, { next: { revalidate: 300 } } as RequestInit);
    return res.ok ? parse(await res.json()) : fallback;
  } catch {
    return fallback;
  }
}

const asList = (json: any) => Array.isArray(json) ? json : [];

export const getTopSupporters = (): Promise<TopSupporter[]> => fetchSupporters('/top', asList, []);

export const getRecentSupporters = (limit = 10): Promise<RecentSupporter[]> =>
  fetchSupporters(`/recent?limit=${limit}`, asList, []);

export const getAllSupporters = (): Promise<AllSupporters | null> =>
  fetchSupporters('/all', json => Array.isArray(json?.names) ? json : null, null);
