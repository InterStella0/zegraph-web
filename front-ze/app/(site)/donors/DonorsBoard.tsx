'use client'
import type { SpecialThanks } from 'types/community';
import { use, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Trophy, Sparkles, type LucideIcon } from 'lucide-react';
import { Skeleton } from 'components/ui/skeleton';
import { cn } from 'components/lib/utils';
import { range } from 'utils/generalUtils';
import { ExpandableText } from './ExpandableText';
import type { TopSupporter, RecentSupporter } from 'utils/supporters';
import {withErrorCatch} from "components/common/withErrorCatch";

const GRID = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8';
const ENTRY = 'rounded-xl border border-border/50 bg-muted/20 px-4 py-3';
const RANK_COLORS: Record<number, string> = { 1: 'text-yellow-500', 2: 'text-zinc-400', 3: 'text-amber-600' };

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function DonorsBoardLoading() {
  return (
    <div className={GRID}>
      {range(3).map((col) => (
        <section key={col} className="space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="space-y-2">
            {range(4).map((row) => (
              <div key={row} className={cn(ENTRY, 'space-y-1.5')}>
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

function BoardSection<T>({ icon: Icon, title, emptyText, items, renderItem }: {
  icon: LucideIcon;
  title: string;
  emptyText: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">{items.map(renderItem)}</div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}

function DonorMessage({ message, clampClassName }: { message: string | null; clampClassName: string }) {
  if (!message) return null;
  return <ExpandableText text={`“${message}”`} className="text-xs text-muted-foreground" clampClassName={clampClassName} />;
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

  if (top.length === 0 && recent.length === 0 && specialThanks.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground space-y-2">
        <p className="text-lg font-medium">{t('noDonors')}</p>
        <p className="text-sm">{t('yourName')}</p>
      </div>
    );
  }

  return (
    <div className={GRID}>
      <BoardSection icon={Trophy} title={t('topDonors')} emptyText={t('noDonors')} items={top} renderItem={(donor) => (
        <div key={donor.rank} className={cn(ENTRY, 'flex items-center gap-3')}>
          <span className={`text-sm font-bold w-6 text-center shrink-0 ${RANK_COLORS[donor.rank] ?? 'text-muted-foreground'}`}>
            {donor.rank}
          </span>
          <div className="min-w-0">
            <p className="font-medium truncate">{donor.name}</p>
            <DonorMessage message={donor.message} clampClassName="truncate" />
          </div>
        </div>
      )} />

      <BoardSection icon={Clock} title={t('recentDonations')} emptyText={t('noDonors')} items={recent} renderItem={(donor) => (
        <div key={`${donor.name}-${donor.created_at}`} className={cn(ENTRY, 'flex items-start justify-between gap-3')}>
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium truncate">{donor.name}</p>
            <DonorMessage message={donor.message} clampClassName="line-clamp-1" />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5 shrink-0">
            {formatDate(donor.created_at, locale)}
          </span>
        </div>
      )} />

      <BoardSection icon={Sparkles} title={t('specialThanks')} emptyText={t('noSpecialThanks')} items={specialThanks} renderItem={(entry) => (
        <div key={entry.id} className={ENTRY}>
          <p className="font-medium truncate">{entry.display_name}</p>
          <ExpandableText text={entry.description} className="text-xs text-muted-foreground" clampClassName="line-clamp-2" />
        </div>
      )} />
    </div>
  );
}

export default withErrorCatch(DonorsBoardDisplay, t => t('donors.noDonors'))
