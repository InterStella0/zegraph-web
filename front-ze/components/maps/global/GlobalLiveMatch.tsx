'use client'
import {Suspense, use, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {useServerMap} from "components/ui/ServerProvider";
import {CurrentMatchDisplay, CurrentMatchSkeleton} from "components/maps/CurrentMatch";
import {loadMapImage} from "lib/batchLoader";
import {Server} from "types/community.ts";
import {SteamProfile} from "types/steam";
import LiveServerList from "./LiveServerList";
import {LiveMatch, liveServers, loadLiveMatch, PrefetchedLiveMatch} from "./liveMatch";

const REFRESH_MS = 65_000;
const LAYOUT = "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 mb-6";

// The list rows already batch-load every live map's image, so the panel reuses that cache.
const cachedImage = (serverId: string, map: string) => loadMapImage(map, serverId);

export function GlobalLiveMatchLoading() {
    return (
        <div className={LAYOUT}>
            <CurrentMatchSkeleton className="h-full"/>
            <div className="h-80 xl:h-auto border border-border rounded-lg bg-card"/>
        </div>
    );
}

function LiveMatchPanel({ server, fresh, topLiveMatchPromise, user }: {
    server: Server | null,
    fresh: LiveMatch | undefined,
    topLiveMatchPromise: Promise<PrefetchedLiveMatch>,
    user: SteamProfile | null,
}) {
    const t = useTranslations('servers.currentMatch');
    const top = use(topLiveMatchPromise);
    const live = fresh ?? (top && top.serverId === server?.id ? top.live : null);

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

export default function GlobalLiveMatch({ userPromise, topLiveMatchPromise }: {
    userPromise: Promise<SteamProfile | null>,
    topLiveMatchPromise: Promise<PrefetchedLiveMatch>,
}) {
    const user = use(userPromise);
    const { communities } = useServerMap();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [fresh, setFresh] = useState<Record<string, LiveMatch>>({});
    const loadedAt = useRef(new Map<string, number>());

    const servers = useMemo(() => liveServers(communities), [communities]);
    const selected = servers.find(server => server.id === selectedId) ?? servers[0] ?? null;
    const serverId = selected?.id ?? null;
    const mapHint = selected?.map ?? null;

    useEffect(() => {
        if (!serverId) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const schedule = () => {
            const last = loadedAt.current.get(serverId) ?? 0;
            timer = setTimeout(refresh, Math.max(0, last + REFRESH_MS - Date.now()));
        };
        const refresh = async () => {
            const live = await loadLiveMatch(serverId, mapHint, cachedImage);
            if (cancelled) return;
            loadedAt.current.set(serverId, Date.now());
            setFresh(prev => ({...prev, [serverId]: live}));
            schedule();
        };

        // Only browser time is compared, so the server-rendered server counts as loaded from when
        // this page received it. Promise.resolve is needed because a promise passed from the server
        // arrives as a thenable that doesn't chain.
        Promise.resolve(topLiveMatchPromise).then(top => {
            if (cancelled) return;
            if (top && !loadedAt.current.has(top.serverId)) loadedAt.current.set(top.serverId, Date.now());
            schedule();
        });

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [serverId, mapHint, topLiveMatchPromise]);

    return (
        <div className={LAYOUT}>
            <Suspense fallback={<CurrentMatchSkeleton className="h-full"/>}>
                <LiveMatchPanel
                    server={selected}
                    fresh={serverId ? fresh[serverId] : undefined}
                    topLiveMatchPromise={topLiveMatchPromise}
                    user={user}
                />
            </Suspense>
            <div className="h-80 xl:h-auto xl:relative">
                <div className="h-full xl:absolute xl:inset-0">
                    <LiveServerList servers={servers} selectedId={serverId} onSelect={setSelectedId}/>
                </div>
            </div>
        </div>
    );
}
