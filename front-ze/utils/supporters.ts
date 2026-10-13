export const SUPPORTERS_ROOT = 'https://queeniemella.cc/api/supporters';
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

async function fetchSupporters<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

export function getTopSupporters(): Promise<TopSupporter[]> {
  return fetchSupporters<TopSupporter>(`${SUPPORTERS_ROOT}/top`);
}

export function getRecentSupporters(limit = 10): Promise<RecentSupporter[]> {
  return fetchSupporters<RecentSupporter>(`${SUPPORTERS_ROOT}/recent?limit=${limit}`);
}

export async function getAllSupporters(): Promise<AllSupporters | null> {
  try {
    const res = await fetch(`${SUPPORTERS_ROOT}/all`, { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json?.names) ? json : null;
  } catch {
    return null;
  }
}
