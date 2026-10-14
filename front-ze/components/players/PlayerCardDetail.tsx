'use client'
import {useTranslations, useLocale} from 'next-intl';
import {ReactElement, use} from "react";
import {secondsToHours, StillCalculate} from "utils/generalUtils";
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
import { ArrowUpRight } from "lucide-react";
import { cn } from "components/lib/utils";
import Link from "next/link";

import relativeTime from 'dayjs/plugin/relativeTime'
import ErrorCatch from "../ui/ErrorMessage.tsx";
import { ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page";
import {DetailedPlayer} from "types/players";
import PlayerDetailHourBar from "./PlayerDetailHourBar";
import {Server} from "types/community";
import PlayerStats, {PlaytimeTotal} from "./PlayerStats";
import PlayerAliasesButton from "./PlayerAliasesButton";
import {PlayerInfo} from "../../app/servers/[server_slug]/players/[player_id]/util.ts";
import {SiSteam} from "@icons-pack/react-simple-icons";
import {usePatchedPlayer, usePlayerStat} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";
import {usePlayerPeriod} from "../../app/servers/[server_slug]/players/[player_id]/PlayerPeriod";
import PlayerClaimButton from "./PlayerClaimButton";
import AssociatePlayerDialog from "./AssociatePlayerDialog";
import {SteamProfile} from "types/steam";
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
            className="rounded-md bg-muted/40 px-2.5 py-1 text-xs font-medium whitespace-nowrap"
        >
            {label} {tCommon('ordinal', {n: rank})}
        </Badge>
    );
}

function GlobalProfileButton({ steamId, label, className }: { steamId: string, label: string, className?: string }) {
    return (
        <Button
            variant="ghost"
            size="sm"
            asChild
            className={cn(
                "border border-primary/40 bg-primary/15 px-3.5 text-foreground has-[>svg]:px-3.5 hover:bg-primary/25 hover:text-foreground dark:hover:bg-primary/25",
                className,
            )}
        >
            <Link href={`/players/${steamId}/profile`}>
                {label}
                <ArrowUpRight />
            </Link>
        </Button>
    );
}

function PlayerCardDetailDisplay({ server, player, user }: { server: Server, player: PlayerInfo, user: SteamProfile | null }): ReactElement {
    const t = useTranslations('players.card');
    const locale = useLocale();
    const { period } = usePlayerPeriod()
    const { data: periodStats } = usePlayerStat<DetailedPlayer>(server.id, player.id, 'detail', !!period)
    const stats = period ? periodStats : player
    const ranks = period ? null : player?.ranks
    let lastPlayedText = t('lastOnline', {ago: dayjs(player.last_played_ended).fromNow(), hours: secondsToHours(player.last_played_duration, locale)});
    if (player.online_since) {
        lastPlayedText = t('playingSince', {ago: dayjs(player.online_since).fromNow()});
    }
    const steamId = !player.id.includes('-')? player.id: player?.associated_player_id? player.associated_player_id: null
    const hasCategory = !!stats?.category && stats.category !== 'unknown'

    return (
        <div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 p-4 border-b border-border sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:p-6">
                <div className="flex w-16 flex-col gap-3 sm:row-span-2 sm:w-[120px]">
                    <PlayerAvatar
                        uuid={player.id}
                        name={player.name}
                        width={120}
                        height={120}
                        className="size-16! rounded-md sm:size-[120px]!"
                    />
                    {steamId && <GlobalProfileButton steamId={steamId} label={t('globalProfile')} className="hidden w-full sm:inline-flex" />}
                </div>

                <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h1 className="min-w-0 truncate text-xl font-semibold sm:text-2xl">
                                {player.name}
                            </h1>
                            {steamId && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-7"
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
                            <PlayerClaimButton
                                serverId={server.id}
                                playerId={player.id}
                                byId={server.byId}
                                associatedPlayerId={player.associated_player_id}
                                user={user}
                            />
                            {user?.is_superuser && !server.byId && (
                                <AssociatePlayerDialog
                                    serverId={server.id}
                                    playerId={player.id}
                                    playerName={player.name}
                                    associatedPlayerId={player.associated_player_id}
                                />
                            )}
                        </div>

                        {player.last_played && <p className={`mt-0.5 text-sm ${player.online_since ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground'}`}>
                            {lastPlayedText}
                        </p>}
                        <AliasesDropdown aliases={player.aliases} />
                    </div>
                    {steamId && <GlobalProfileButton steamId={steamId} label={t('globalShort')} className="sm:hidden" />}
                </div>

                {(ranks || hasCategory) && <div className="col-span-2 mt-4 flex flex-wrap gap-2 sm:col-span-1 sm:col-start-2 sm:mt-3 sm:content-start">
                    {ranks && <RankChip label={t('ranked')} rank={ranks?.server_playtime}/>}
                    {hasCategory && (
                        <CategoryChip category={stats.category} size="small" className="rounded-md px-2.5 py-1"/>
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
                </div>}

                <PlaytimeTotal
                    player={stats}
                    className="col-span-full mt-4 border-t pt-4 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:border-0 sm:pt-0"
                />

                <PlayerStats player={stats} className="col-span-full mt-4 sm:mt-6"/>
            </div>
            <PlayerDetailHourBar player={player} server={server} />
        </div>
    );
}


export default function PlayerCardDetail({ serverPlayerPromise, userPromise }: {
    serverPlayerPromise: Promise<ServerPlayerDetailed>,
    userPromise: Promise<SteamProfile | null>,
}) {
    const t = useTranslations('players.card');
    const {server, player } = usePatchedPlayer(serverPlayerPromise)
    const user = use(userPromise)
    if (player instanceof StillCalculate)
        return null // Should not reach here

    return (
        <Card className="w-full">
            <ErrorCatch message={t('noDetail')}>
                <PlayerCardDetailDisplay server={server} player={player} user={user} />
            </ErrorCatch>
        </Card>
    )
}