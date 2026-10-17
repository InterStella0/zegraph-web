'use client'
import {use, useEffect, useMemo, useState} from 'react';
import {useTranslations} from 'next-intl';
import {getMapImage} from "utils/generalUtils";
import {useServerMap} from "components/ui/ServerProvider";
import {CurrentMatchDisplay, CurrentMatchSkeleton} from "components/maps/CurrentMatch";
import {getContinentStatsNow, getMatchNow} from "../../../app/servers/[server_slug]/maps/util";
import {ServerMapMatch} from "types/maps.ts";
import {ContinentStatistics} from "types/players.ts";
import {SteamProfile} from "types/steam";
import LiveServerList from "./LiveServerList";

const REFRESH_MS = 65_000;

type LiveMatch = {
    serverId: string,
    match: ServerMapMatch | null,
    continents: ContinentStatistics | null,
    image: string | null,
};

export function GlobalLiveMatchLoading() {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 mb-6">
            <CurrentMatchSkeleton className="h-full"/>
            <div className="h-80 xl:h-auto border border-border rounded-lg bg-card"/>
        </div>
    );
}

export default function GlobalLiveMatch({ userPromise }: { userPromise: Promise<SteamProfile | null> }) {
    const t = useTranslations('servers.currentMatch');
    const user = use(userPromise);
    const { communities } = useServerMap();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [live, setLive] = useState<LiveMatch | null>(null);

    const servers = useMemo(() => communities
        .flatMap(community => community.servers)
        .filter(server => server.status)
        .sort((a, b) => b.players - a.players), [communities]);

    const selected = servers.find(server => server.id === selectedId) ?? servers[0] ?? null;
    const serverId = selected?.id ?? null;

    useEffect(() => {
        if (!serverId) return;
        let cancelled = false;

        const load = async () => {
            const [match, continents] = await Promise.all([
                getMatchNow(serverId).catch(err => {
                    console.error('Failed to load current match:', err);
                    return null;
                }),
                getContinentStatsNow(serverId).catch(err => {
                    console.error('Error fetching continent stats:', err);
                    return null;
                }),
            ]);
            const image = match?.map ? (await getMapImage(serverId, match.map))?.large ?? null : null;
            if (!cancelled) setLive({serverId, match, continents, image});
        };

        load();
        const interval = setInterval(load, REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [serverId]);

    const current = live?.serverId === serverId ? live : null;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 mb-6">
            {!selected || (current && !current.match) ? (
                <div className="border border-border rounded-lg bg-card p-6 flex items-center justify-center">
                    <h6 className="text-lg text-muted-foreground text-center py-8">{t('noActiveMatch')}</h6>
                </div>
            ) : current?.match ? (
                <CurrentMatchDisplay
                    className="h-full"
                    showServer
                    server={selected}
                    mapImage={current.image}
                    currentMatch={current.match}
                    continentData={current.continents}
                    user={user}
                />
            ) : (
                <CurrentMatchSkeleton className="h-full"/>
            )}
            <div className="h-80 xl:h-auto xl:relative">
                <div className="h-full xl:absolute xl:inset-0">
                    <LiveServerList servers={servers} selectedId={serverId} onSelect={setSelectedId}/>
                </div>
            </div>
        </div>
    );
}
