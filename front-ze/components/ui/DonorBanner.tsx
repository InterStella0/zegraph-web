'use client'
import Link from 'next/link';
import { URI } from 'utils/generalUtils';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Donor {
  id: string;
  display_name: string;
  message: string | null;
  donated_at: string;
}

async function getDonors(): Promise<Donor[]> {
  try {
    const res = await fetch(URI('/donations'), { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data ?? [];
  } catch {
    return [];
  }
}

const LS_KEY = 'donor_banner_dismissed';

export function DonorBanner() {
  const [donors, setDonors] = useState<Donor[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getDonors().then(setDonors);
  }, []);

  useEffect(() => {
    if (!donors || donors.length === 0) return;
    const sorted = [...donors].sort(
      (a, b) => new Date(b.donated_at).getTime() - new Date(a.donated_at).getTime(),
    );
    const latestId = sorted[0].id;
    setDismissed(localStorage.getItem(LS_KEY) === latestId);
  }, [donors]);

  if (!donors || donors.length === 0 || dismissed) return null;

  const sorted = [...donors].sort(
    (a, b) => new Date(b.donated_at).getTime() - new Date(a.donated_at).getTime(),
  );
  const latestId = sorted[0].id;
  const shown = sorted.slice(0, 3);
  const remaining = sorted.length - shown.length;
  const names = shown.map((d) => d.display_name).join(', ');
  const suffix = remaining > 0 ? ` +${remaining} more` : '';

  const handleDismiss = () => {
    localStorage.setItem(LS_KEY, latestId);
    setDismissed(true);
  };

  return (
    <div className="w-full bg-muted/50 border-b border-border/30 py-1.5 px-4 text-center text-xs text-muted-foreground relative">
      <span>
        {'❤ Thanks to our supporters: '}
        <span className="font-medium text-foreground/80">{names}{suffix}</span>
        {' — '}
        <Link
          href="/donors"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Support us!
        </Link>
      </span>
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-foreground/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
