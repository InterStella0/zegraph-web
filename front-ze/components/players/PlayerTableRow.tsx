"use client"

import {useLocale, useTranslations} from "next-intl";
import { PlayerAvatar } from "./PlayerAvatar.tsx";
import dayjs from "dayjs";
import {secondsToHours, secondsToMins, simpleRandom} from "utils/generalUtils.ts";
import { ErrorBoundary } from "react-error-boundary";
import {useEffect, useState} from "react";
import relativeTime from "dayjs/plugin/relativeTime";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {ExtendedPlayerBrief} from "types/players.ts";
import { useTheme } from "next-themes";
import { TableRow, TableCell } from "components/ui/table";
import { Skeleton } from "components/ui/skeleton";
import { cn } from "components/lib/utils";
import {PlayerName} from "./PlayerName";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";

dayjs.extend(relativeTime)

type PlayerTableRowProps = {
    player: ExtendedPlayerBrief,
    timeUnit?: "h" | "m",
    showRank?: boolean,
    href?: string,
    compact?: boolean,
}

function PlayerInformation({ player, timeUnit = "h", showRank = false, href, compact = false }: PlayerTableRowProps) {
    const t = useTranslations('players.card');
    const locale = useLocale();
    const { resolvedTheme } = useTheme();
    const isDarkMode = resolvedTheme === 'dark';
    const server = useServerData()?.server

    const isOnline = !!player.online_since;

    const timeTaken = {
        h: (value: number) => `${secondsToHours(value)}h`,
        m: (value: number) => `${secondsToMins(value)}m`
    };

    const playtime = timeTaken[timeUnit](player.total_playtime);

    const statusText = isOnline
        ? t('playingSince', {ago: dayjs(player.online_since).fromNow()})
        : t('lastOnline', {ago: dayjs(player.last_played_ended ?? player.last_played).fromNow(), hours: secondsToHours(player.last_played_duration, locale)});

    return (
        <TableRow
            className={cn(
                isOnline && "border-l-4 border-l-green-500"
            )}
        >
            <TableCell className={cn("pl-2", showRank ? "py-3 sm:py-3.5" : "py-2 sm:py-3", !compact && "sm:pl-4")}>
                <div className="flex items-center">
                    <div className={cn("relative flex-shrink-0", showRank && "mx-1")}>
                        <PlayerAvatar uuid={player.id} name={player.name} className="flex-shrink-0" />
                        {showRank && (
                            <span className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-background px-1.5 font-mono text-[9px] sm:text-[10px] leading-4 tabular-nums text-muted-foreground">
                                #{player.rank.toLocaleString(locale)}
                            </span>
                        )}
                    </div>

                    <div className={cn("min-w-0", compact ? "ml-2 flex-1" : "ml-2 sm:ml-4")}>
                        <HoverPrefetchLink
                            href={href ?? `/servers/${server.gotoLink}/players/${player.id}`}
                            className={cn(
                                "font-semibold tracking-wide mb-1 whitespace-nowrap overflow-hidden text-ellipsis text-sm sm:text-base",
                                compact ? "block max-w-full" : "inline-block max-w-[11rem] max-sm:max-w-[10rem]",
                                "hover:underline transition-colors",
                                isDarkMode ? "text-white" : "text-gray-900"
                            )}
                        >
                            <PlayerName
                                name={player.name}
                                isAnonymous={player.is_anonymous}
                                hiddenFromOthers={player.hidden_from_others}
                            />
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
                className={cn("py-2 sm:py-3 pr-2 align-middle", !compact && "sm:pr-6")}
            >
                <div
                    className={cn(
                        "inline-flex items-center justify-center py-1 sm:py-1.5 rounded",
                        compact ? "px-2 text-xs" : "px-2 sm:px-3 min-w-[60px] sm:min-w-[90px] text-xs sm:text-sm",
                        "font-medium",
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

export function PlayerTableRowLoading({ showRank = false, compact = false }: { showRank?: boolean, compact?: boolean } = {}) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true)
    }, [])

    const randomNameWidth = simpleRandom(80, 130, isClient);

    return (
        <TableRow>
            <TableCell className={cn("pl-2", showRank ? "py-3 sm:py-3.5" : "py-2 sm:py-3", !compact && "sm:pl-4")}>
                <div className="flex items-center">
                    <div className={cn("relative flex-shrink-0", showRank && "mx-1")}>
                        <Skeleton className="w-[40px] h-[40px] rounded-full" />
                        {showRank && (
                            <Skeleton className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 h-3.5 w-9 rounded-full" />
                        )}
                    </div>
                    <div className={cn("min-w-0", compact ? "ml-2 flex-1" : "ml-2 sm:ml-4")}>
                        <span className="font-semibold tracking-wide mb-1 inline-block max-w-full text-sm sm:text-base">
                            <Skeleton
                                className={cn("inline-block align-middle h-4 sm:h-5 max-w-[6rem]", compact ? "max-w-full" : "sm:max-w-none")}
                                style={{ width: `${randomNameWidth}px` }}
                            />{'\u200b'}
                        </span>
                        <div className="text-[10px] sm:text-xs flex items-center">
                            <span>
                                <Skeleton className={cn("inline-block align-middle h-3 sm:h-3.5 w-24", !compact && "sm:w-40")} />{'\u200b'}
                            </span>
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell align="right" className={cn("py-2 sm:py-3 pr-2 align-middle", !compact && "sm:pr-6")}>
                <Skeleton className={cn("inline-flex py-1 sm:py-1.5 rounded font-medium", compact ? "px-2 min-w-[48px] text-xs" : "px-2 sm:px-3 min-w-[60px] sm:min-w-[90px] text-xs sm:text-sm")}>
                    {'\u200b'}
                </Skeleton>
            </TableCell>
        </TableRow>
    );
}

export default function PlayerTableRow({ player, timeUnit = "h", showRank = false, href, compact = false }: PlayerTableRowProps) {
    return (
        <ErrorBoundary fallback={<PlayerRowError />}>
            <PlayerInformation player={player} timeUnit={timeUnit} showRank={showRank} href={href} compact={compact} />
        </ErrorBoundary>
    );
}
