'use client'
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import Link from "next/link";
import {Magnet} from "lucide-react";
import {Card} from "components/ui/card";
import {Skeleton} from "components/ui/skeleton";
import {getMapImage, range} from "utils/generalUtils";
import {PlayerMapPull as MapPull} from "types/players.ts";
import {Server} from "types/community.ts";
import {withErrorCatch} from "components/common/withErrorCatch";
import {useSignedIn} from "components/auth/SignedIn";
import LoginLocked, {isLoginRequired} from "components/ui/LoginLocked";
import {PeriodTitle, ServerPlayerProps, useServerPlayer, useServerPlayerStat} from "./common";

const TILE_GRID = "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6";

function MapPullTile({ entry, server }: { entry: MapPull, server: Server }) {
    const t = useTranslations('players.mapPull');
    const [image, setImage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getMapImage(server.id, entry.map)
            .then(found => { if (!cancelled) setImage(found?.medium ?? null) })
            .catch(() => {});
        return () => { cancelled = true };
    }, [server.id, entry.map]);

    return (
        <Link
            href={`/servers/${server.gotoLink}/maps/${entry.map}`}
            className="group relative block overflow-hidden rounded-lg border h-[128px] bg-muted"
        >
            {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" loading="lazy"
                     className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
            <div className="relative flex h-full flex-col justify-between p-3 text-white">
                <span className="self-end rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    {t('lift', {lift: entry.lift.toFixed(1)})}
                </span>
                <div className="min-w-0">
                    <p className="truncate font-semibold" title={entry.map}>{entry.map}</p>
                    <p className="text-xs text-white/80">
                        {t('joined', {joins: entry.early_joins, chances: entry.chances})}
                    </p>
                </div>
            </div>
        </Link>
    );
}

function PlayerMapPullDisplay({ serverPlayerPromise }: ServerPlayerProps) {
    const t = useTranslations('players.mapPull');
    const { server } = useServerPlayer(serverPlayerPromise);
    const { data, loading, error } = useServerPlayerStat<MapPull[]>(serverPlayerPromise, 'map_pull');

    if (isLoginRequired(error))
        return <LoginLocked title={t('title')} />;
    if (error) throw error;

    const baseline = data?.[0]?.baseline_rate;
    return (
        <Card className="p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <PeriodTitle title={<span className="inline-flex items-center gap-2"><Magnet className="h-5 w-5" />{t('title')}</span>} />
                {baseline !== undefined && (
                    <span className="text-xs text-muted-foreground">
                        {t('usual', {rate: (baseline * 100).toFixed(1)})}
                    </span>
                )}
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t('description')}</p>
            {loading || !data ? (
                <div className={TILE_GRID}>
                    {range(6).map(i => <Skeleton key={i} className="h-[128px] rounded-lg" />)}
                </div>
            ) : data.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
                <div className={TILE_GRID}>
                    {data.map(entry => <MapPullTile key={entry.map} entry={entry} server={server} />)}
                </div>
            )}
        </Card>
    );
}

const PlayerMapPullCaught = withErrorCatch(PlayerMapPullDisplay, t => t('players.mapPull.loadError'));

export default function PlayerMapPull({ serverPlayerPromise }: ServerPlayerProps) {
    const t = useTranslations('players.mapPull');
    if (!useSignedIn())
        return <LoginLocked title={t('title')} />;
    return <PlayerMapPullCaught serverPlayerPromise={serverPlayerPromise} />;
}
