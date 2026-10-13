'use client'
import Link from 'next/link';
import { X } from 'lucide-react';
import { use, useEffect, useState } from 'react';
import { DONOR_BANNER_DISMISSED, DonorBannerData } from 'utils/supporters';

function saveDismissal(latestId: string) {
  document.cookie = `${DONOR_BANNER_DISMISSED}=${encodeURIComponent(latestId)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function DonorBanner({ bannerPromise }: { bannerPromise: Promise<DonorBannerData | null> }) {
  const banner = use(bannerPromise);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!banner || localStorage.getItem(DONOR_BANNER_DISMISSED) !== banner.latestId) return;
    localStorage.removeItem(DONOR_BANNER_DISMISSED);
    saveDismissal(banner.latestId);
    setDismissed(true);
  }, [banner]);

  if (!banner || dismissed) return null;

  const suffix = banner.remaining > 0 ? ` +${banner.remaining} more` : '';

  const handleDismiss = () => {
    saveDismissal(banner.latestId);
    setDismissed(true);
  };

  return (
    <div className="w-full bg-muted/50 border-b border-border/30 py-1.5 px-4 text-center text-xs text-muted-foreground relative">
      <span>
        {'❤ Thanks to our supporters: '}
        <span className="font-medium text-foreground/80">{banner.names}{suffix}</span>
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
