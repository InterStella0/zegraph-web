'use client'
import Link from 'next/link';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getRecentSupporters, RecentSupporter } from 'utils/supporters';

const LS_KEY = 'donor_banner_dismissed';

export function DonorBanner() {
  const [donors, setDonors] = useState<RecentSupporter[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getRecentSupporters(10).then(setDonors);
  }, []);

  useEffect(() => {
    if (!donors || donors.length === 0) return;
    setDismissed(localStorage.getItem(LS_KEY) === donors[0].created_at);
  }, [donors]);

  if (!donors || donors.length === 0 || dismissed) return null;

  // Already newest first; the same supporter can appear more than once.
  const uniqueNames = [...new Set(donors.map((d) => d.name))];
  const latestId = donors[0].created_at;
  const shown = uniqueNames.slice(0, 3);
  const remaining = uniqueNames.length - shown.length;
  const names = shown.join(', ');
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
