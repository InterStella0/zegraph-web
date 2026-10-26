'use client'
import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Loader2, Pause, Play} from 'lucide-react';
import {Button} from 'components/ui/button';
import {AdSpot} from "components/ui/AdSpot";
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {useServerMap} from "components/ui/ServerProvider";
import {cn} from "components/lib/utils";
import {useCommunityColors} from "lib/hooks/useCommunityColors";
import {LiveEvent, LiveEventKind} from "components/live/liveEvents";
import {LiveConnection, useLiveEvents, useNow} from "components/live/useLiveEvents";
import {LiveEventRow} from "components/live/LiveEventRow";

type Filter = 'all' | LiveEventKind;

const FILTERS: { key: Filter, label: string, dot: string }[] = [
    { key: 'all', label: 'tabAll', dot: 'bg-muted-foreground' },
    { key: 'player', label: 'tabPlayers', dot: 'bg-emerald-500' },
    { key: 'map', label: 'tabMaps', dot: 'bg-pink-500' },
    { key: 'infraction', label: 'tabInfractions', dot: 'bg-amber-500' },
];

const RENDER_STEP = 100;
const MINUTE_MS = 60_000;

function formatUptime(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const pad = (value: number) => String(value).padStart(2, '0');
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
    return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

function LiveStatus({ connection, paused, connectedAt, events }: {
    connection: LiveConnection,
    paused: boolean,
    connectedAt: number | null,
    events: LiveEvent[],
}) {
    const t = useTranslations('tracker');
    const now = useNow();
    const perMinute = useMemo(
        () => events.reduce((count, event) => count + (now - event.at < MINUTE_MS ? 1 : 0), 0),
        [events, now],
    );

    const live = connection === 'live';
    const label = !live ? t(connection) : paused ? t('paused') : t('live');

    return (
        <div className="flex h-9 items-center gap-2.5 rounded-md border border-border bg-card px-3 text-sm" role="status">
            {live
                ? <span className={cn(
                    "size-2 rounded-full",
                    paused ? "bg-amber-500" : "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/25",
                )}/>
                : <Loader2 className="size-3.5 animate-spin text-amber-500"/>}
            <span className="font-medium">{label}</span>
            {live && <>
                <span className="font-mono text-xs text-muted-foreground">{t('perMinute', {count: perMinute})}</span>
                <span className="h-3.5 w-px bg-border" aria-hidden/>
                <span className="font-mono text-xs text-muted-foreground">
                    {t('uptime', {time: formatUptime(connectedAt && now ? now - connectedAt : 0)})}
                </span>
            </>}
        </div>
    );
}

function FilterTabs({ value, onChange, counts }: {
    value: Filter,
    onChange: (filter: Filter) => void,
    counts: Record<Filter, number>,
}) {
    const t = useTranslations('tracker');
    return (
        <div role="tablist" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map(filter => {
                const active = filter.key === value;
                return (
                    <button
                        key={filter.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(filter.key)}
                        className={cn(
                            "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                            active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <span className={cn("size-1.5 rounded-full", filter.dot)}/>
                        {t(filter.label)}
                        <span className="rounded bg-muted px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {counts[filter.key]}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** Up to 2000 rows each load avatars and map art, so they mount a page at a time as the list scrolls. */
function EventList({ events, waiting }: { events: LiveEvent[], waiting: boolean }) {
    const t = useTranslations('tracker');
    const [renderCount, setRenderCount] = useState(RENDER_STEP);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const hasMore = events.length > renderCount;

    const {communities} = useServerMap();
    const communityColors = useCommunityColors(useMemo(() => communities.map(community => ({
        key: community.id,
        name: community.name,
        icon_url: community.icon_url,
    })), [communities]));

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMore) return;
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) setRenderCount(count => count + RENDER_STEP);
        }, { rootMargin: '600px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, renderCount]);

    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            {events.length === 0
                ? <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
                    {waiting && <Loader2 className="size-4 animate-spin"/>}
                    {waiting ? t('connecting') : t('noEvents')}
                </div>
                : <div className="divide-y divide-border">
                    {events.slice(0, renderCount).map(event => (
                        <ErrorCatch key={event.key} message={t('eventRenderError')}>
                            <LiveEventRow event={event} communityColors={communityColors}/>
                        </ErrorCatch>
                    ))}
                </div>}
            {hasMore && (
                <div ref={sentinelRef} className="flex justify-center border-t border-border py-3">
                    <Loader2 className="size-4 animate-spin text-muted-foreground"/>
                </div>
            )}
        </div>
    );
}

export default function LiveServerTrackerPage() {
    const t = useTranslations('tracker');
    const feed = useLiveEvents();
    const [filter, setFilter] = useState<Filter>('all');

    const counts = useMemo(() => {
        const counted: Record<Filter, number> = { all: feed.events.length, player: 0, map: 0, infraction: 0 };
        for (const event of feed.events) counted[event.kind] += 1;
        return counted;
    }, [feed.events]);

    const visible = useMemo(
        () => filter === 'all' ? feed.events : feed.events.filter(event => event.kind === filter),
        [feed.events, filter],
    );
    const everything = useMemo(() => [...feed.queued, ...feed.events], [feed.queued, feed.events]);

    return (
        <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
                    <p className="text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <LiveStatus
                        connection={feed.connection}
                        paused={feed.paused}
                        connectedAt={feed.connectedAt}
                        events={everything}
                    />
                    <Button variant="outline" onClick={feed.paused ? feed.resume : feed.pause}>
                        {feed.paused ? <Play className="fill-current"/> : <Pause className="fill-current"/>}
                        {feed.paused ? t('resume') : t('pause')}
                        {feed.paused && feed.queued.length > 0 && (
                            <span className="rounded bg-primary px-1.5 font-mono text-[11px] text-primary-foreground">
                                +{feed.queued.length}
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            <FilterTabs value={filter} onChange={setFilter} counts={counts}/>

            <AdSpot/>

            <EventList key={filter} events={visible} waiting={feed.connection === 'connecting'}/>
        </div>
    );
}
