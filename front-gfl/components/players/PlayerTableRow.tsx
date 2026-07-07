"use client"

import {useLocale, useTranslations} from "next-intl";
import { PlayerAvatar } from "./PlayerAvatar.tsx";
import dayjs from "dayjs";
import {fetchServerUrl, secondsToHours, secondsToMins, simpleRandom} from "utils/generalUtils.ts";
import { ErrorBoundary } from "react-error-boundary";
import {useEffect, useState} from "react";
import Link from "next/link";
import relativeTime from "dayjs/plugin/relativeTime";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {ExtendedPlayerBrief} from "types/players.ts";
import { useTheme } from "next-themes";
import { TableRow, TableCell } from "components/ui/table";
import { Skeleton } from "components/ui/skeleton";
import { cn } from "components/lib/utils";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";

dayjs.extend(relativeTime)

function PlayerInformation(
    { player, timeUnit = "h", showRank = false }: { player: ExtendedPlayerBrief, timeUnit?: "h" | "m", showRank?: boolean }
) {
    const t = useTranslations('players.card');
    const locale = useLocale();
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === 'dark';
    const server_id = player.server_id
    const { server } = useServerData()
    const [ playerStatus, setPlayerStatus ] = useState(null)

    useEffect(() => {
        fetchServerUrl(player.server_id, `/players/${player.id}/playing`)
            .then(setPlayerStatus)
    }, [server_id, player.id])

    let isOnline = playerStatus? playerStatus.ended_at == null: !!player.online_since;

    const timeTaken = {
        h: (value: number) => `${secondsToHours(value)}h`,
        m: (value: number) => `${secondsToMins(value)}m`
    };

    const playtime = timeTaken[timeUnit](player.total_playtime);

    let statusText: string
    if (playerStatus){
        statusText = isOnline? t('playingSince', {ago: dayjs(playerStatus.started_at).fromNow()})
            : t('lastOnline', {
                ago: dayjs(playerStatus.started_at).fromNow(),
                hours: dayjs(playerStatus.ended_at).diff(dayjs(playerStatus.started_at), 'h', true).toFixed(2)
            })
    }else{
        statusText = isOnline
            ? t('playingSince', {ago: dayjs(player.online_since).fromNow()})
            : t('lastOnline', {ago: dayjs(player.last_played).fromNow(), hours: secondsToHours(player.last_played_duration, locale)});
    }

    return (
        <TableRow
            className={cn(
                isOnline && "border-l-4 border-l-green-500"
            )}
        >
            <TableCell className="py-2 sm:py-3 pl-2 sm:pl-4">
                <div className="flex items-center">
                    {showRank && (
                        <span className="w-8 sm:w-9 flex-shrink-0 text-center font-mono text-xs sm:text-sm text-muted-foreground">
                            #{player.rank}
                        </span>
                    )}
                    <PlayerAvatar uuid={player.id} name={player.name} />

                    <div className="ml-2 sm:ml-4 min-w-0">
                        <HoverPrefetchLink
                            href={`/servers/${server.gotoLink}/players/${player.id}`}
                            className={cn(
                                "font-semibold tracking-wide mb-1 max-w-[11rem] max-sm:max-w-[10rem] whitespace-nowrap overflow-hidden text-ellipsis inline-block text-sm sm:text-base",
                                "hover:underline transition-colors",
                                isDarkMode ? "text-white" : "text-gray-900"
                            )}
                        >
                            {player.name}
                        </HoverPrefetchLink>
                        <div
                            className={cn(
                                "text-[10px] sm:text-xs flex items-center gap-1 sm:gap-1.5",
                                isOnline
                                    ? "text-green-500"
                                    : isDarkMode ? "text-slate-400" : "text-slate-500"
                            )}
                        >
                            {isOnline && (
                                <span
                                    className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"
                                />
                            )}
                            <span className="truncate">{statusText}</span>
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell
                align="right"
                className="py-2 sm:py-3 pr-2 sm:pr-6 align-middle"
            >
                <div
                    className={cn(
                        "inline-flex items-center justify-center px-2 sm:px-3 py-1 sm:py-1.5 rounded min-w-[60px] sm:min-w-[90px]",
                        "font-medium text-xs sm:text-sm",
                        isDarkMode
                            ? "bg-black/20 text-white"
                            : "bg-black/5 text-gray-900"
                    )}
                >
                    {playtime}
                </div>
            </TableCell>
        </TableRow>
    );
}

function PlayerRowError() {
    const t = useTranslations('players.list');
    return (
        <TableRow>
            <TableCell colSpan={2} className="text-center py-4">
                <div className={cn(
                    "flex items-center justify-center gap-2 p-2 rounded",
                    "bg-red-500/10 text-red-500"
                )}>
                    <span role="img" aria-label="warning">⚠️</span>
                    <span>{t('unableToLoad')}</span>
                </div>
            </TableCell>
        </TableRow>
    );
}

export function PlayerTableRowLoading({ showRank = false }: { showRank?: boolean } = {}) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true)
    }, [])

    const randomNameWidth = simpleRandom(80, 130, isClient);

    return (
        <TableRow>
            <TableCell className="py-2 sm:py-3 pl-2 sm:pl-4">
                <div className="flex items-center">
                    {showRank && (
                        <span className="w-8 sm:w-9 flex-shrink-0 flex justify-center">
                            <Skeleton className="h-3 sm:h-4 w-5" />
                        </span>
                    )}
                    <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                    <div className="ml-2 sm:ml-4 min-w-0">
                        <Skeleton
                            className="h-4 sm:h-5 mb-2 max-w-[6rem] sm:max-w-none"
                            style={{ width: `${randomNameWidth}px` }}
                        />
                        <Skeleton className="h-3 sm:h-3.5 w-24 sm:w-40" />
                    </div>
                </div>
            </TableCell>
            <TableCell align="right" className="py-2 sm:py-3 pr-2 sm:pr-6">
                <Skeleton className="h-7 sm:h-8 w-[60px] sm:w-[90px] rounded ml-auto" />
            </TableCell>
        </TableRow>
    );
}

export default function PlayerTableRow(
    { player, timeUnit = "h", showRank = false }: { player: ExtendedPlayerBrief, timeUnit?: "h" | "m", showRank?: boolean }
) {
    return (
        <ErrorBoundary fallback={<PlayerRowError />}>
            <PlayerInformation player={player} timeUnit={timeUnit} showRank={showRank} />
        </ErrorBoundary>
    );
}
