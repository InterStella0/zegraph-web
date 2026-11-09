'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import dayjs from 'dayjs';
import {HoverCard, HoverCardContent, HoverCardTrigger} from 'components/ui/hover-card';
import {Skeleton} from 'components/ui/skeleton';
import {fetchServerUrl, getMapImage, StillCalculate} from 'utils/generalUtils';
import {MapAnalyze, MapImage, ServerMapMatch} from 'types/maps';
import {ContinentStatistics} from 'types/players';

const CONTINENTS: Record<string, [label: string, color: string]> = {
    "Europe": ["EU", "#3b82f6"],
    "North America": ["NA", "#22c55e"],
    "South America": ["SA", "#84cc16"],
    "Asia": ["AS", "#ef4444"],
    "Oceania": ["OC", "#a855f7"],
    "Africa": ["AF", "#f97316"],
};

type HoverData = {
    match: ServerMapMatch | null,
    image: MapImage | null,
    avgSeconds: number | null,
    continents: ContinentStatistics | null,
};

const loaded = new Map<string, Promise<HoverData>>();

async function loadHoverData(serverId: string, map: string): Promise<HoverData> {
    const [match, image, analyze] = await Promise.all([
        fetchServerUrl(serverId, '/match-now').catch(() => null) as Promise<ServerMapMatch | null>,
        getMapImage(serverId, map),
        fetchServerUrl(serverId, `/maps/${map}/analyze`, {}, false).catch(() => null) as Promise<MapAnalyze | StillCalculate | null>,
    ]);
    const current = match?.map === map ? match : null;
    const continents = current
        ? await fetchServerUrl(serverId, `/sessions/${current.time_id}/continents`).catch(() => null) as ContinentStatistics | null
        : null;
    const avgSeconds = analyze && !(analyze instanceof StillCalculate) && analyze.total_sessions > 0
        ? analyze.total_playtime / analyze.total_sessions
        : null;
    return {match: current, image, avgSeconds, continents};
}

function getHoverData(serverId: string, map: string) {
    const key = `${serverId}:${map}`;
    if (!loaded.has(key)) {
        const promise = loadHoverData(serverId, map);
        loaded.set(key, promise);
        setTimeout(() => loaded.delete(key), 60_000);
    }
    return loaded.get(key)!;
}

const clock = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

function MapHoverBody({serverId, map}: {serverId: string, map: string}) {
    const t = useTranslations('home.mapHover');
    const [data, setData] = useState<HoverData | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        let active = true;
        getHoverData(serverId, map).then(result => { if (active) setData(result) });
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => { active = false; clearInterval(timer) };
    }, [serverId, map]);

    const match = data?.match;
    const elapsed = match ? (now - dayjs(match.started_at).valueOf()) / 1000 : null;
    const end = match?.server_time_end ?? match?.estimated_time_end;
    const left = end
        ? (dayjs(end).valueOf() - now) / 1000
        : data?.avgSeconds != null && elapsed != null ? data.avgSeconds - elapsed : null;
    const total = elapsed != null && left != null && left > 0 ? elapsed + left : data?.avgSeconds ?? null;
    const progress = elapsed != null && total ? Math.min(100, (elapsed / total) * 100) : 0;
    const hasScore = match?.human_score != null && match?.zombie_score != null;

    const continents = data?.continents;
    const regionTotal = continents?.total_count || 0;
    const regions = regionTotal > 0
        ? [...continents!.continents].sort((a, b) => b.count - a.count)
            .map(c => ({name: c.name, pct: (c.count / regionTotal) * 100, meta: CONTINENTS[c.name]}))
        : [];

    return <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
            {data === null
                ? <Skeleton className="h-14 w-24 shrink-0 rounded-md" />
                : data.image
                    ? <img src={data.image.small} alt="" className="h-14 w-24 shrink-0 rounded-md object-cover" />
                    : <div className="h-14 w-24 shrink-0 rounded-md bg-muted" />}
            <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" title={map}>{map}</p>
                {match && <p className="text-xs font-medium text-primary">▶ {t('playing')}</p>}
            </div>
            {hasScore && <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
                {match!.human_score}:{match!.zombie_score}
            </span>}
        </div>

        {data === null ? <Skeleton className="h-10 w-full" /> : match && elapsed != null && <div className="flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{width: `${progress}%`}} />
            </div>
            <div className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                <span>{t('played', {time: clock(elapsed)})}</span>
                <span>
                    {data.avgSeconds != null && t('usually', {minutes: Math.round(data.avgSeconds / 60)})}
                    {data.avgSeconds != null && left != null && left > 0 && ' · '}
                    {left != null && left > 0 && <span className="font-semibold text-foreground">{t('left', {minutes: Math.ceil(left / 60)})}</span>}
                </span>
            </div>
        </div>}

        {regions.length > 0 && <div className="flex flex-col gap-1.5">
            <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
                {regions.map(r => <div key={r.name} className="h-full" style={{width: `${r.pct}%`, backgroundColor: r.meta?.[1] ?? '#9ca3af'}} />)}
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                {regions.filter(r => r.meta).slice(0, 3).map(r => <span key={r.name}>{r.meta[0]} {Math.round(r.pct)}%</span>)}
            </div>
        </div>}
    </div>;
}

export default function MapHoverCard({serverId, serverLink, map}: {serverId: string, serverLink: string, map: string}) {
    return <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
            <Link href={`/servers/${serverLink}/maps`} className="truncate text-muted-foreground hover:text-primary hover:underline underline-offset-2">{map}</Link>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)]">
            <MapHoverBody serverId={serverId} map={map} />
        </HoverCardContent>
    </HoverCard>;
}
