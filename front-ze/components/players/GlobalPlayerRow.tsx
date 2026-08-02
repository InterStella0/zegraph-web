'use client'
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {useEffect, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {Badge} from "components/ui/badge";
import {Avatar, AvatarImage} from "components/ui/avatar";
import {Skeleton} from "components/ui/skeleton";
import {PlayerAvatar} from "./PlayerAvatar.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {GAME_META} from "components/ui/ServerIndicator";
import {GlobalPlayerBrief, PlayerCommunityPlaytime} from "types/players.ts";
import {fetchUrl, secondsToHours} from "utils/generalUtils.ts";
import {cn} from "components/lib/utils";
import {useCommunityColors} from "lib/hooks/useCommunityColors";
import {Gamepad2} from "lucide-react";

dayjs.extend(relativeTime)

const MAX_LEGEND = 4;

function HoursSplitBar({ communities, loading }: { communities: PlayerCommunityPlaytime[], loading: boolean }) {
    const t = useTranslations('players.global');
    const colors = useCommunityColors(communities.map(c => ({
        key: c.community_id,
        name: c.community_name,
        icon_url: c.icon_url,
    })));

    if (loading) {
        return (
            <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    {t('hoursSplit')}
                </p>
                <Skeleton className="h-2 w-full rounded-full"/>
                <Skeleton className="h-3 w-32 mt-1.5"/>
            </div>
        );
    }

    const splitSummary = communities
        .map(c => `${c.community_name} ${secondsToHours(c.total_playtime)}h`)
        .join(', ');

    return (
        <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {t('hoursSplit')}
            </p>
            <div
                className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${t('hoursSplit')}: ${splitSummary}`}
            >
                {communities.map(community => (
                    <div
                        key={community.community_id}
                        aria-hidden
                        style={{
                            flexGrow: community.total_playtime,
                            minWidth: '2%',
                            backgroundColor: colors[community.community_id],
                        }}
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                {communities.slice(0, MAX_LEGEND).map(community => (
                    <span
                        key={community.community_id}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                    >
                        <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{backgroundColor: colors[community.community_id]}}
                        />
                        {community.community_name}
                    </span>
                ))}
                {communities.length > MAX_LEGEND && (
                    <span className="text-xs text-muted-foreground">
                        {t('moreCommunities', {count: communities.length - MAX_LEGEND})}
                    </span>
                )}
            </div>
        </div>
    );
}

export default function GlobalPlayerRow({ player }: { player: GlobalPlayerBrief }) {
    const t = useTranslations('players.global');
    const locale = useLocale();
    const [communities, setCommunities] = useState<PlayerCommunityPlaytime[]>([]);
    const [communitiesLoading, setCommunitiesLoading] = useState<boolean>(true);
    const isOnline = !!player.online_since;
    const lastCommunity = communities.find(c => c.community_id === player.last_community_id);
    const gameMeta = player.game ? GAME_META[player.game] : undefined;

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        setCommunitiesLoading(true);
        fetchUrl(`/players/${player.id}/communities_playtime`, {signal})
            .then((data: PlayerCommunityPlaytime[]) => setCommunities(data ?? []))
            .catch(error => {
                if (signal.aborted) return;
                console.error(`Error fetching communities playtime for player ${player.id}:`, error);
                setCommunities([]);
            })
            .finally(() => {
                if (!signal.aborted) setCommunitiesLoading(false);
            });
        return () => {
            controller.abort("Changed");
        };
    }, [player.id]);

    return (
        <div
            className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 hover:bg-accent/50 transition-colors"
        >
            <div className="flex items-center gap-3 min-w-0 sm:w-56">
                <PlayerAvatar uuid={player.id} name={player.name} width={40} height={40} className="flex-shrink-0"/>
                <div className="min-w-0">
                    <HoverPrefetchLink href={`/players/${player.id}/profile`} className="font-semibold text-sm sm:text-base hover:underline truncate">
                        {player.name}
                    </HoverPrefetchLink>
                    <div
                        className={cn(
                            "text-xs flex items-center gap-1.5",
                            isOnline ? "text-green-500" : "text-muted-foreground"
                        )}
                    >
                        {lastCommunity?.icon_url && (
                            <Avatar className="w-4 h-4 flex-shrink-0">
                                <AvatarImage src={lastCommunity.icon_url} alt={lastCommunity.community_name}/>
                            </Avatar>
                        )}
                        {isOnline && (
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"/>
                        )}
                        <span className="truncate">
                            {isOnline ? t('online') : t('lastSeen', {ago: dayjs(player.last_played).fromNow()})}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <span>{t('serversCount', {count: player.server_count})}</span>
                        {gameMeta && (
                            <>
                                <span>·</span>
                                <Badge
                                    variant="outline"
                                    className={`h-5 px-1.5 gap-1 text-[10px] flex-shrink-0 ${gameMeta.className}`}
                                >
                                    <Gamepad2 className="h-3 w-3" />
                                    <span className="whitespace-nowrap">{gameMeta.label}</span>
                                </Badge>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-w-40 max-sm:order-last max-sm:w-full">
                <HoursSplitBar communities={communities} loading={communitiesLoading}/>
            </div>

            <div className="flex flex-col items-end gap-1 ml-auto">
                <div className="text-right">
                    <p className="text-xl sm:text-2xl font-bold tabular-nums leading-none">
                        {secondsToHours(player.total_playtime, locale)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                        {t('hoursAllTime')}
                    </p>
                </div>
                <Badge variant="outline">{t('rank', {rank: player.rank})}</Badge>
            </div>
        </div>
    );
}
