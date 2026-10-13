'use client'
import { use } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Trophy, Sparkles } from 'lucide-react';
import { Skeleton } from 'components/ui/skeleton';
import ErrorCatch from 'components/ui/ErrorMessage.tsx';
import { ExpandableText } from './ExpandableText';
import type { TopSupporter, RecentSupporter } from 'utils/supporters';

export interface SpecialThanks {
  id: string;
  display_name: string;
  description: string;
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function DonorsBoardLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {Array.from({ length: 3 }).map((_, col) => (
        <section key={col} className="space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, row) => (
              <div
                key={row}
                className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 space-y-1.5"
              >
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DonorsBoardDisplay({
  topPromise,
  recentPromise,
  specialThanksPromise,
  locale,
}: {
  topPromise: Promise<TopSupporter[]>;
  recentPromise: Promise<RecentSupporter[]>;
  specialThanksPromise: Promise<SpecialThanks[]>;
  locale: string;
}) {
  const t = useTranslations('donors');
  const top = use(topPromise);
  const recent = use(recentPromise);
  const specialThanks = use(specialThanksPromise);

  return top.length > 0 || recent.length > 0 || specialThanks.length > 0 ? (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

      {/* Top donors */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('topDonors')}</h2>
        </div>
        {top.length > 0 ? (
        <div className="space-y-2">
          {top.map((donor) => (
            <div
              key={donor.rank}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3"
            >
              <span className={`text-sm font-bold w-6 text-center shrink-0 ${
                donor.rank === 1 ? 'text-yellow-500' :
                donor.rank === 2 ? 'text-zinc-400' :
                donor.rank === 3 ? 'text-amber-600' :
                'text-muted-foreground'
              }`}>
                {donor.rank}
              </span>
              <div className="min-w-0">
                <p className="font-medium truncate">{donor.name}</p>
                {donor.message && (
                  <ExpandableText
                    text={`“${donor.message}”`}
                    className="text-xs text-muted-foreground"
                    clampClassName="truncate"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noDonors')}</p>
        )}
      </section>

      {/* Recent donations */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('recentDonations')}</h2>
        </div>
        {recent.length > 0 ? (
        <div className="space-y-2">
          {recent.map((donor) => (
            <div
              key={`${donor.name}-${donor.created_at}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium truncate">{donor.name}</p>
                {donor.message && (
                  <ExpandableText
                    text={`“${donor.message}”`}
                    className="text-xs text-muted-foreground"
                    clampClassName="line-clamp-1"
                  />
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5 shrink-0">
                {formatDate(donor.created_at, locale)}
              </span>
            </div>
          ))}
        </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noDonors')}</p>
        )}
      </section>

      {/* Special thanks */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('specialThanks')}</h2>
        </div>
        {specialThanks.length > 0 ? (
        <div className="space-y-2">
          {specialThanks.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3"
            >
              <p className="font-medium truncate">{entry.display_name}</p>
              <ExpandableText
                text={entry.description}
                className="text-xs text-muted-foreground"
                clampClassName="line-clamp-2"
              />
            </div>
          ))}
        </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noSpecialThanks')}</p>
        )}
      </section>
    </div>
  ) : (
    <div className="text-center py-16 text-muted-foreground space-y-2">
      <p className="text-lg font-medium">{t('noDonors')}</p>
      <p className="text-sm">{t('yourName')}</p>
    </div>
  );
}

export default function DonorsBoard(props: {
  topPromise: Promise<TopSupporter[]>;
  recentPromise: Promise<RecentSupporter[]>;
  specialThanksPromise: Promise<SpecialThanks[]>;
  locale: string;
}) {
  const t = useTranslations('donors');
  return (
    <ErrorCatch message={t('noDonors')}>
      <DonorsBoardDisplay {...props} />
    </ErrorCatch>
  );
}
