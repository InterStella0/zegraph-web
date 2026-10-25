'use client'
import {useLocale, useTranslations} from 'next-intl';
import {CSSProperties, ReactElement, ReactNode} from "react";
import {ArrowUpRight} from "lucide-react";
import { Skeleton } from "components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import { cn } from "components/lib/utils";
import {formatNumber, secondsToHours} from "utils/generalUtils";
import {
    DetailedPlayer,
    ExternalPlaytime,
    GflPlayerStats,
    MapeadoresPlayerStats,
    NidePlayerStats,
    PlayerExternalStats,
} from "types/players";
import {PlayerPeriod, usePeriodLabel, usePlayerPeriod} from "../../app/servers/[server_slug]/players/[player_id]/PlayerPeriod.tsx";
import {PlayerStatSuspense, usePlayerStatSeed} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";

const SOURCE_NAMES: Record<string, string> = {
    gfl: 'GFL',
    nide: 'NiDE',
    mapeadores: 'Mapeadores',
};

export const SPLIT_SEGMENTS = [
    { key: 'casual', className: 'bg-green-600' },
    { key: 'mixed', className: 'bg-blue-500' },
    { key: 'tryhard', className: 'bg-red-500' },
    { key: 'untagged', className: 'bg-muted-foreground/50' },
] as const;

type SplitKey = typeof SPLIT_SEGMENTS[number]['key'];

const HATCH: CSSProperties = {
    backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-muted-foreground) 30%, transparent) 0 2px, transparent 2px 6px)',
};

const EMPTY = '—';

const SECTION_LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground';

type PlaytimeSummary = {
    total: number,
    tracked: number,
    missing: number,
    over: number,
    external: ExternalPlaytime | null,
    split: Record<SplitKey, number>,
}

function summarize(player: DetailedPlayer, period: PlayerPeriod): PlaytimeSummary {
    const external = period ? null : player.external_playtime ?? null;
    const correction = external?.playtime_correction ?? 0;
    const tracked = external ? external.tracked_playtime : player.total_playtime;
    const tagged = player.casual_playtime + player.mixed_playtime + player.tryhard_playtime;
    return {
        total: player.total_playtime,
        tracked,
        missing: Math.max(correction, 0),
        over: Math.max(-correction, 0),
        external,
        split: {
            casual: player.casual_playtime,
            mixed: player.mixed_playtime,
            tryhard: player.tryhard_playtime,
            untagged: Math.max(tracked - tagged, 0),
        },
    };
}

function sourceName(source: string): string {
    return SOURCE_NAMES[source] ?? source;
}

function formatDay(value: string | null | undefined, locale: string, compact = false): string {
    if (!value) return EMPTY;
    const date = new Date(value);
    const withYear = !compact || date.getUTCFullYear() !== new Date().getUTCFullYear();
    return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        ...(withYear ? { year: 'numeric' } : {}),
        timeZone: 'UTC',
    }).format(date);
}

function formatCountry(code: string | null, name: string | null, locale: string): string {
    if (code) {
        try {
            return new Intl.DisplayNames(locale, { type: 'region' }).of(code.toUpperCase()) ?? name ?? code;
        } catch {
            return name ?? code;
        }
    }
    return name ?? EMPTY;
}

function formatPercent(value: number, locale: string, precise = false): string {
    return formatNumber(value, precise && value > 0 && value < 10 ? 1 : 0, locale);
}

export function PlaytimeTotal({ player, className }: { player: DetailedPlayer | null, className?: string }): ReactElement {
    const t = useTranslations('players.stats');
    const locale = useLocale();
    const { period } = usePlayerPeriod();
    const periodLabel = usePeriodLabel(period);

    if (!player) {
        return <div className={cn("flex flex-col gap-2 sm:items-end", className)}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-48" />
            <Skeleton className="h-5 w-40" />
        </div>
    }

    const { total, external } = summarize(player, period);
    const source = external ? sourceName(external.source) : null;
    const short = source
        ? t('viaSource', { source, date: formatDay(external!.fetched_at, locale, true) })
        : t('viaSessions', { period: periodLabel });
    const long = source
        ? t('reportedBy', { source, date: formatDay(external!.fetched_at, locale) })
        : t('fromSessions', { period: periodLabel });

    const href = safeUrl(external?.source_url);

    return <div className={cn("min-w-0 sm:text-right", className)}>
        <div className="flex items-baseline justify-between gap-3">
            <span className={cn(SECTION_LABEL, "sm:w-full")}>{t('totalPlaytime')}</span>
            <SourceLink href={href} className="inline-flex min-w-0 text-xs text-muted-foreground sm:hidden">
                <span className="truncate">{short}</span>
            </SourceLink>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5 sm:justify-end">
            <span className="text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-5xl">
                {secondsToHours(total, locale)}
            </span>
            <span className="text-base text-muted-foreground sm:text-lg">{t('hrs')}</span>
        </div>
        <SourceLink
            href={href}
            className="mt-2 hidden rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex"
            linkClassName="hover:bg-primary/20"
        >
            {long}
        </SourceLink>
    </div>
}

function safeUrl(value: string | null | undefined): string | null {
    return value && /^https?:\/\//i.test(value) ? value : null;
}

function SourceLink({ href, className, linkClassName, children }: {
    href: string | null, className?: string, linkClassName?: string, children: ReactNode,
}): ReactElement {
    if (!href) return <span className={className}>{children}</span>;
    return <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("items-center gap-1 transition-colors hover:text-foreground", className, linkClassName)}
    >
        {children}
        <ArrowUpRight className="size-3 shrink-0" />
    </a>
}

export default function PlayerStats({ player, className }: { player: DetailedPlayer | null, className?: string }): ReactElement {
    const { period } = usePlayerPeriod();
    return <div className={cn("min-w-0", className)}>
        <PlaytimeBreakdown player={player} />
        {!period && (
            <PlayerStatSuspense>
                <ExternalStatsSection player={player} />
            </PlayerStatSuspense>
        )}
    </div>
}

function PlaytimeBreakdown({ player }: { player: DetailedPlayer | null }): ReactElement {
    const t = useTranslations('players.stats');
    const locale = useLocale();
    const { period } = usePlayerPeriod();

    if (!player) {
        return <div className="space-y-3">
            <Skeleton className="hidden h-4 w-2/3 sm:block" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-4 w-full" />
        </div>
    }

    const { tracked, missing, over, external, split } = summarize(player, period);
    const source = external ? sourceName(external.source) : null;
    const scale = tracked + missing;
    const width = (seconds: number) => scale > 0 ? seconds / scale * 100 : 0;
    const share = (seconds: number) => tracked > 0 ? seconds / tracked * 100 : 0;
    const hours = (seconds: number) => secondsToHours(seconds, locale);

    return <div className="space-y-3">
        {source && over > 0 && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    {t('adjusted')}
                </span>
                <span className="sm:hidden">{t('adjustedShort', { over: hours(over) })}</span>
                <span className="hidden sm:inline">
                    {t('adjustedBody', { tracked: hours(tracked), over: hours(over), source })}
                </span>
            </div>
        )}
        {source && missing > 0 && (
            <p className="hidden text-sm text-muted-foreground sm:block">
                {t.rich('inSessionHistory', {
                    hours: hours(tracked),
                    pct: formatPercent(width(tracked), locale, true),
                    b: chunks => <span className="font-semibold text-foreground">{chunks}</span>,
                })}
            </p>
        )}

        <TooltipProvider>
            <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
                {SPLIT_SEGMENTS.filter(segment => split[segment.key] > 0).map(segment => (
                    <Tooltip key={segment.key}>
                        <TooltipTrigger asChild>
                            <div className={`${segment.className} h-full`} style={{ width: `${width(split[segment.key])}%` }} />
                        </TooltipTrigger>
                        <TooltipContent>
                            {t(segment.key)} · {hours(split[segment.key])} {t('hrs')} ({formatPercent(share(split[segment.key]), locale)}%)
                        </TooltipContent>
                    </Tooltip>
                ))}
                {missing > 0 && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="h-full" style={{ ...HATCH, width: `${width(missing)}%` }} />
                        </TooltipTrigger>
                        <TooltipContent>
                            {t('notInSessions')} · {hours(missing)} {t('hrs')}
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </TooltipProvider>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-1">
                {SPLIT_SEGMENTS.map(segment => (
                    <li key={segment.key} className="grid grid-cols-[auto_1fr] items-center gap-x-2 text-sm sm:flex">
                        <span className={`size-2 rounded-sm ${segment.className}`} aria-hidden />
                        <span className="text-muted-foreground">{t(segment.key)}</span>
                        <span className="col-start-2 font-semibold tabular-nums">{hours(split[segment.key])}</span>
                        <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                            {formatPercent(share(split[segment.key]), locale)}%
                        </span>
                    </li>
                ))}
            </ul>
            {missing > 0 && (
                <div className="flex items-center gap-2 border-t border-dashed pt-3 text-sm sm:border-0 sm:pt-0">
                    <span className="size-2.5 rounded-sm" style={HATCH} aria-hidden />
                    <span className="flex-1 text-muted-foreground">{t('notInSessions')}</span>
                    <span className="font-semibold tabular-nums">{hours(missing)}</span>
                </div>
            )}
        </div>
    </div>
}

function ExternalStatsSection({ player }: { player: DetailedPlayer | null }): ReactElement | null {
    const t = useTranslations('players.stats');
    const { seed: stats } = usePlayerStatSeed<PlayerExternalStats>('external_stats');
    if (!stats) return null;

    const reported = player?.external_playtime?.source === stats.source;
    return <div className="mt-5 space-y-2.5 border-t pt-4">
        <div className={SECTION_LABEL}>{t(`statsHeading.${stats.source}`)}</div>
        {stats.source === 'gfl' && <GflStats stats={stats} />}
        {stats.source === 'nide' && <NideStats stats={stats} reported={reported} />}
        {stats.source === 'mapeadores' && <MapeadoresStats stats={stats} reported={reported} />}
    </div>
}

function StatItem({ label, value, detail }: { label: string, value: ReactNode, detail?: ReactNode }): ReactElement {
    return <div className="min-w-0 sm:mr-6 sm:border-r sm:pr-6">
        <dt className="truncate text-xs text-muted-foreground">{label}</dt>
        <dd className="flex items-baseline gap-1.5">
            <span className="truncate text-lg font-semibold tabular-nums">{value}</span>
            {detail != null && <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>}
        </dd>
    </div>
}

function StatRow({ children, footer }: { children: ReactNode, footer?: ReactNode }): ReactElement {
    return <>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-0">{children}</dl>
        {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
    </>
}

function useStatFormat() {
    const locale = useLocale();
    const t = useTranslations('players.stats');
    return {
        count: (value: number | null | undefined, decimals = 0) =>
            value == null ? EMPTY : formatNumber(value, decimals, locale),
        hours: (seconds: number | null | undefined) =>
            seconds == null ? EMPTY : `${secondsToHours(seconds, locale)} ${t('hrs')}`,
        rank: (value: number | null | undefined) =>
            value == null ? undefined : `#${formatNumber(value, 0, locale)}`,
        day: (value: string | null | undefined) => formatDay(value, locale),
        country: (code: string | null, name: string | null) => formatCountry(code, name, locale),
    };
}

function GflStats({ stats }: { stats: GflPlayerStats }): ReactElement {
    const t = useTranslations('players.stats');
    const f = useStatFormat();
    return <StatRow footer={t('footerGfl')}>
        <StatItem label={t('playtime')} value={f.hours(stats.human_time + stats.zombie_time)} detail={f.rank(stats.rank_total_playtime)} />
        <StatItem label={t('humanTime')} value={f.hours(stats.human_time)} detail={f.rank(stats.rank_human_time)} />
        <StatItem label={t('zombieTime')} value={f.hours(stats.zombie_time)} detail={f.rank(stats.rank_zombie_time)} />
        <StatItem label={t('points')} value={f.count(stats.points)} detail={f.rank(stats.rank_points)} />
        <StatItem label={t('zombieKills')} value={f.count(stats.zombie_killed)} detail={f.rank(stats.rank_zombie_killed)} />
        <StatItem label={t('headshots')} value={f.count(stats.headshot)} detail={f.rank(stats.rank_headshot)} />
        <StatItem label={t('timesInfected')} value={f.count(stats.infected_time)} detail={f.rank(stats.rank_infected_time)} />
        <StatItem label={t('bossKills')} value={f.count(stats.boss_killed)} detail={f.rank(stats.rank_boss_killed)} />
        <StatItem label={t('leaderCount')} value={f.count(stats.leader_count)} detail={f.rank(stats.rank_leader_count)} />
        <StatItem label={t('itemUsage')} value={f.count(stats.item_usage)} detail={f.rank(stats.rank_item_usage)} />
        <StatItem label={t('topDefender')} value={f.count(stats.td_count)} detail={f.rank(stats.rank_td_count)} />
        {stats.personaname && <StatItem label={t('knownAs')} value={stats.personaname} />}
        {stats.last_seen && <StatItem label={t('lastSeen')} value={f.day(stats.last_seen)} />}
    </StatRow>
}

function NideStats({ stats, reported }: { stats: NidePlayerStats, reported: boolean }): ReactElement {
    const t = useTranslations('players.stats');
    const f = useStatFormat();
    const headshotRate = stats.headshots_per_kill == null ? undefined : t('headshotRate', { pct: f.count(stats.headshots_per_kill * 100, 1) });
    const footer = reported ? undefined : t('reportedBy', { source: SOURCE_NAMES.nide, date: f.day(stats.updated_at) });
    return <StatRow footer={footer}>
        {!reported && <StatItem label={t('playtime')} value={f.hours(stats.playtime)} />}
        <StatItem label={t('points')} value={f.count(stats.points)} detail={f.rank(stats.rank)} />
        <StatItem label={t('kills')} value={f.count(stats.kills)} />
        <StatItem label={t('deaths')} value={f.count(stats.deaths)} />
        <StatItem label={t('kd')} value={f.count(stats.kills_per_death, 2)} />
        <StatItem label={t('killsPerMinute')} value={f.count(stats.kills_per_minute, 2)} />
        <StatItem label={t('headshots')} value={f.count(stats.headshots)} detail={headshotRate} />
        <StatItem label={t('shotsPerKill')} value={f.count(stats.shots_per_kill, 1)} />
        <StatItem label={t('accuracy')} value={stats.weapon_accuracy == null ? EMPTY : `${f.count(stats.weapon_accuracy, 1)}%`} />
        <StatItem label={t('longestStreak')} value={f.count(stats.longest_kill_streak)} />
        <StatItem label={t('longestDeathStreak')} value={f.count(stats.longest_death_streak)} />
        {stats.name && <StatItem label={t('knownAs')} value={stats.name} />}
        {(stats.country_code || stats.country) && <StatItem label={t('country')} value={f.country(stats.country_code, stats.country)} />}
    </StatRow>
}

function MapeadoresStats({ stats, reported }: { stats: MapeadoresPlayerStats, reported: boolean }): ReactElement {
    const t = useTranslations('players.stats');
    const f = useStatFormat();
    const footer = reported ? undefined : t('reportedBy', { source: SOURCE_NAMES.mapeadores, date: f.day(stats.fetched_at) });
    return <StatRow footer={footer}>
        {!reported && <StatItem label={t('playtime')} value={f.hours(stats.playtime)} />}
        <StatItem label={t('leaderboardPosition')} value={f.rank(stats.position)} />
        <StatItem label={t('knownAs')} value={stats.name} />
        {stats.is_supporter && <StatItem label={t('status')} value={t('supporter')} />}
    </StatRow>
}
