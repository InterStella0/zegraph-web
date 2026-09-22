export const SUPPORTERS_ROOT = 'https://queeniemella.cc/api/supporters';

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
