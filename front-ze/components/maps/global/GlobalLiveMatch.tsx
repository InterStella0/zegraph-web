'use client'
import {Suspense, use, useEffect, useMemo, useRef, useState, useTransition} from 'react';
import {useTranslations} from 'next-intl';
import {useServerMap} from "components/ui/ServerProvider";
import {CurrentMatchDisplay, CurrentMatchSkeleton} from "components/maps/CurrentMatch";
import {loadMapImage} from "lib/batchLoader";
import {Server} from "types/community.ts";
import {SteamProfile} from "types/steam";
import LiveServerList from "./LiveServerList";
import {LiveMatch, loadLiveMatch} from "./liveMatch";

const REFRESH_MS = 65_000;

// The list rows already batch-load every live map's image, so the panel reuses that cache.
const cachedImage = (serverId: string, map: string) => loadMapImage(map, serverId);

type LiveMatches = Record<string, Promise<LiveMatch>>;

export function GlobalLiveMatchLoading() {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 mb-6">
            <CurrentMatchSkeleton className="h-full"/>
            <div className="h-80 xl:h-auto border border-border rounded-lg bg-card"/>
        </div>
    );
}

function LiveMatchPanel({ server, fresh, liveMatchesPromise, user }: {
    server: Server | null,
    fresh: LiveMatch | undefined,
    liveMatchesPromise: Promise<LiveMatches>,
    user: SteamProfile | null,
}) {
    const t = useTranslations('servers.currentMatch');
    const prefetched = use(liveMatchesPromise)[server?.id ?? ''];
    const live = fresh ?? (prefetched ? use(prefetched) : null);

    if (!server || (live && !live.match)) return (
        <div className="h-full border border-border rounded-lg bg-card p-6 flex items-center justify-center">
            <h6 className="text-lg text-muted-foreground text-center py-8">{t('noActiveMatch')}</h6>
        </div>
    );
    if (!live) return <CurrentMatchSkeleton className="h-full"/>;
    return (
        <CurrentMatchDisplay
            className="h-full"
            showServer
            server={server}
            mapImage={live.image}
            currentMatch={live.match}
            continentData={live.continents}
            user={user}
        />
    );
}

export default function GlobalLiveMatch({ userPromise, liveMatchesPromise }: {
    userPromise: Promise<SteamProfile | null>,
    liveMatchesPromise: Promise<LiveMatches>,
}) {
    const user = use(userPromise);
    const { communities } = useServerMap();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [fresh, setFresh] = useState<Record<string, LiveMatch>>({});
    const freshAt = useRef(new Map<string, number>());
    const [switching, startTransition] = useTransition();

    const servers = useMemo(() => communities
        .flatMap(community => community.servers)
        .filter(server => server.status)
        .sort((a, b) => b.players - a.players), [communities]);

    const selected = servers.find(server => server.id === selectedId) ?? servers[0] ?? null;
    const serverId = selected?.id ?? null;
    const mapHint = selected?.map ?? null;

    useEffect(() => {
        if (!serverId) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const schedule = (at: number) => {
            timer = setTimeout(refresh, Math.max(0, at + REFRESH_MS - Date.now()));
        };
        const refresh = async () => {
            const live = await loadLiveMatch(serverId, mapHint, cachedImage);
            if (cancelled) return;
            freshAt.current.set(serverId, live.at);
            setFresh(prev => ({...prev, [serverId]: live}));
            schedule(live.at);
        };

        // Prefetched servers only refresh once their data ages out; anything that came online after
        // the page rendered has nothing prefetched and loads straight away. Promise.resolve is
        // needed because a promise passed from the server arrives as a thenable that doesn't chain.
        const known = freshAt.current.get(serverId);
        const lastAt = known != null
            ? Promise.resolve(known)
            : Promise.resolve(liveMatchesPromise).then(all => all[serverId] ?? null).then(entry => entry?.at ?? 0);
        lastAt.then(at => {
            if (!cancelled) schedule(at);
        });

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [serverId, mapHint, liveMatchesPromise]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 mb-6">
            <div className={`transition-opacity ${switching ? 'opacity-60' : ''}`}>
                <Suspense fallback={<CurrentMatchSkeleton className="h-full"/>}>
                    <LiveMatchPanel
                        server={selected}
                        fresh={serverId ? fresh[serverId] : undefined}
                        liveMatchesPromise={liveMatchesPromise}
                        user={user}
                    />
                </Suspense>
            </div>
            <div className="h-80 xl:h-auto xl:relative">
                <div className="h-full xl:absolute xl:inset-0">
                    <LiveServerList
                        servers={servers}
                        selectedId={serverId}
                        onSelect={id => startTransition(() => setSelectedId(id))}
                    />
                </div>
            </div>
        </div>
    );
}
