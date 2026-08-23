'use client'
import {useTranslations, useLocale} from 'next-intl';
import {ReactElement} from "react";
import {fetchApiServerUrl, secondsToHours, StillCalculate} from "utils/generalUtils";
import { Card } from "components/ui/card";
import { Button } from "components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "components/ui/tooltip";
import { Badge } from "components/ui/badge";
import dayjs from "dayjs";
import { PlayerAvatar } from "./PlayerAvatar";
import CategoryChip from "../ui/CategoryChip";
import { Clock, UserRound } from "lucide-react";
import Link from "next/link";

import relativeTime from 'dayjs/plugin/relativeTime'
import ErrorCatch from "../ui/ErrorMessage.tsx";
import { ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page";
import {PlayerWithLegacyRanks} from "types/players";
import PlayerDetailHourBar from "./PlayerDetailHourBar";
import {Server} from "types/community";
import PlayerStats from "./PlayerStats";
import PlayerAliasesButton from "./PlayerAliasesButton";
import {PlayerInfo} from "../../app/servers/[server_slug]/players/[player_id]/util.ts";
import {SiSteam} from "@icons-pack/react-simple-icons";
import {usePatchedPlayer} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";
dayjs.extend(relativeTime)

function AliasesDropdown({ aliases }) {
    const t = useTranslations('players.card');
    const primaryAlias = aliases[0]?.name || '';
    const remainingCount = aliases.length - 1;

    return (
        <div className="relative">
            <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm overflow-hidden text-ellipsis whitespace-nowrap inline-block">
                    {primaryAlias}
                </span>

                {remainingCount > 0 && <PlayerAliasesButton aliases={aliases} />}

                {remainingCount > 0 && (
                    <span className="text-xs text-muted-foreground/60">
                        {t('moreAliases', {count: remainingCount})}
                    </span>
                )}
            </div>
        </div>
    );
}

function RankChip({ label, rank, title = undefined }) {
    const tCommon = useTranslations('common');
    return (
        <Badge
            variant="outline"
            title={title}
            className="px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap"
        >
            {label} {tCommon('ordinal', {n: rank})}
        </Badge>
    );
}
async function getCStatsCSGO(server_id: string, player_id: string): Promise<PlayerWithLegacyRanks | null> {
    if (server_id !== '65bdad6379cefd7ebcecce5c' || !player_id) return null
    try{
        return await fetchApiServerUrl(server_id, `/players/${player_id}/legacy_stats`)
    }catch(e){
        return null
    }
}

/**
 * The promise handed to `use()` must outlive the render that created it.
 *
 * `PlayerStats` suspends on this promise, and a suspended render is discarded -- `useMemo` included.
 * Memoizing it therefore builds an infinite loop: retry, fresh promise, suspend, discard, retry. A
 * module-level cache keyed on the ids is the state that survives, so every retry resolves the same
 * in-flight request. This dataset is a frozen CS:GO-era snapshot, so caching it for the tab's lifetime
 * costs nothing in freshness.
 */
const cStatsCache = new Map<string, Promise<PlayerWithLegacyRanks | null>>();

function cStatsFor(server_id: string, player_id: string): Promise<PlayerWithLegacyRanks | null> {
    const key = `${server_id}:${player_id}`;
    let promise = cStatsCache.get(key);
    if (!promise) {
        promise = getCStatsCSGO(server_id, player_id);
        cStatsCache.set(key, promise);
    }
    return promise;
}

function PlayerCardDetailDisplay({ server, player }: { server: Server, player: PlayerInfo }): ReactElement {
    const t = useTranslations('players.card');
    const locale = useLocale();
    const cStats = cStatsFor(server.id, player.id)
    const ranks = player?.ranks
    let lastPlayedText = t('lastOnline', {ago: dayjs(player.last_played_ended).fromNow(), hours: secondsToHours(player.last_played_duration, locale)});
    if (player.online_since) {
        lastPlayedText = t('playingSince', {ago: dayjs(player.online_since).fromNow()});
    }
    const steamId = !player.id.includes('-')? player.id: player?.associated_player_id? player.associated_player_id: null

    return (
        <div>
            <div className="max-w-full bg-card rounded-sm p-4 flex flex-col sm:flex-row items-center sm:items-start border-b border-border">
                <div className="mr-0 sm:mr-4 mb-4 sm:mb-0 relative">
                    <PlayerAvatar
                        uuid={player.id}
                        name={player.name}
                        width={110}
                        height={110}
                        variant="rounded"
                        style={{ borderRadius: '4px' }}
                    />
                </div>

                <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left justify-between sm:min-h-[120px]">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2 justify-center sm:justify-start">
                            <h1 className="text-xl font-normal flex items-center">
                                {player.name}
                            </h1>
                            {steamId && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                asChild
                                            >
                                                <a
                                                    href={`https://steamcommunity.com/profiles/${steamId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    <SiSteam className="text-primary"/>
                                                </a>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{t('viewSteamProfile')}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                            {steamId && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={`/players/${steamId}/profile`}>
                                        <UserRound />
                                        {t('globalProfile')}
                                    </Link>
                                </Button>
                            )}
                        </div>

                        <p className={`mb-2 italic text-sm ${player.online_since ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground'}`}>
                            <Clock className="inline-block w-4 h-4 mr-1" />
                            {lastPlayedText}
                        </p>
                        <AliasesDropdown aliases={player.aliases} />
                    </div>

                    <div className="flex mt-4 sm:mt-auto gap-2 justify-center sm:justify-start">
                        <div className="flex flex-wrap mt-4 sm:mt-auto gap-2 justify-center sm:justify-start max-w-full">
                            {ranks && <RankChip label={t('ranked')} rank={ranks?.server_playtime}/>}
                            {player.category && player.category !== 'unknown' && (
                                <CategoryChip category={player.category} size="medium"/>
                            )}
                            {ranks && <RankChip label={t('global')} rank={ranks?.global_playtime} title={t('globalTitle')}/>}
                            {ranks && <RankChip label={t('tryhard')} rank={ranks?.tryhard_playtime}/>}
                            {ranks && <RankChip label={t('casual')} rank={ranks?.casual_playtime}/>}
                            {ranks && ranks?.highest_map_rank &&
                                <RankChip
                                    label={`${ranks?.highest_map_rank?.map} -`}
                                    rank={ranks?.highest_map_rank?.rank}
                                    title={t('topOnMap', {rank: ranks?.highest_map_rank?.rank, map: ranks?.highest_map_rank?.map, hours: secondsToHours(ranks?.highest_map_rank?.total_playtime, locale)})}/>
                            }
                        </div>
                    </div>
                </div>

                <PlayerStats player={player} cStatsPromise={cStats}/>
            </div>
            <PlayerDetailHourBar player={player} server={server} />
        </div>
    );
}


export default function PlayerCardDetail({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed> }) {
    const t = useTranslations('players.card');
    // Not `use(serverPlayerPromise)` directly: this is the one component that renders detail-derived
    // numbers, so it reads the copy the stale-stats banner can patch.
    const {server, player } = usePatchedPlayer(serverPlayerPromise)
    if (player instanceof StillCalculate)
        return null // Should not reach here

    return (
        <Card className="w-full">
            <ErrorCatch message={t('noDetail')}>
                <PlayerCardDetailDisplay server={server} player={player} />
            </ErrorCatch>
        </Card>
    )
}