"use client"

import {useLocale, useTranslations} from "next-intl";
import { PlayerAvatar } from "./PlayerAvatar.tsx";
import dayjs from "lib/dayjs";
import {secondsToHours, simpleRandom} from "utils/generalUtils.ts";
import { ErrorBoundary } from "react-error-boundary";
import {ReactNode} from "react";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {ExtendedPlayerBrief} from "types/players.ts";
import { TableRow, TableCell } from "components/ui/table";
import { Skeleton, SkeletonText } from "components/ui/skeleton";
import { cn } from "components/lib/utils";
import {useHydrated} from "lib/hooks/useHydrated";
import {PlayerName} from "./PlayerName";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";

type RowOptions = { showRank?: boolean, compact?: boolean };

type PlayerTableRowProps = RowOptions & {
    player: ExtendedPlayerBrief,
    href?: string,
}

function RowLayout({ showRank, compact, className, avatar, children, value }: RowOptions & {
    className?: string, avatar: ReactNode, children: ReactNode, value: ReactNode,
}) {
    return (
        <TableRow className={className}>
            <TableCell className={cn("pl-2", showRank ? "py-3 sm:py-3.5" : "py-2 sm:py-3", !compact && "sm:pl-4")}>
                <div className="flex items-center">
                    <div className={cn("relative flex-shrink-0", showRank && "mx-1")}>
                        {avatar}
                    </div>
                    <div className={cn("min-w-0", compact ? "ml-2 flex-1" : "ml-2 sm:ml-4")}>
                        {children}
                    </div>
                </div>
            </TableCell>
            <TableCell align="right" className={cn("py-2 sm:py-3 pr-2 align-middle", !compact && "sm:pr-6")}>
                {value}
            </TableCell>
        </TableRow>
    );
}

function PlayerInformation({ player, showRank = false, href, compact = false }: PlayerTableRowProps) {
    const t = useTranslations('players.card');
    const locale = useLocale();
    const server = useServerData()?.server
    const isOnline = !!player.online_since;

    const statusText = isOnline
        ? t('playingSince', {ago: dayjs(player.online_since).fromNow()})
        : t('lastOnline', {ago: dayjs(player.last_played_ended ?? player.last_played).fromNow(), hours: secondsToHours(player.last_played_duration, locale)});

    return (
        <RowLayout
            showRank={showRank}
            compact={compact}
            className={cn(isOnline && "border-l-4 border-l-green-500")}
            avatar={<>
                <PlayerAvatar uuid={player.id} name={player.name} className="flex-shrink-0" />
                {showRank && (
                    <span className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-background px-1.5 font-mono text-[9px] sm:text-[10px] leading-4 tabular-nums text-muted-foreground">
                        #{player.rank.toLocaleString(locale)}
                    </span>
                )}
            </>}
            value={
                <div
                    className={cn(
                        "inline-flex items-center justify-center py-1 sm:py-1.5 rounded",
                        compact ? "px-2 text-xs" : "px-2 sm:px-3 min-w-[60px] sm:min-w-[90px] text-xs sm:text-sm",
                        "font-medium bg-black/5 text-gray-900 dark:bg-black/20 dark:text-white"
                    )}
                >
                    {secondsToHours(player.total_playtime)}h
                </div>
            }
        >
            <HoverPrefetchLink
                href={href ?? `/servers/${server.gotoLink}/players/${player.id}`}
                className={cn(
                    "font-semibold tracking-wide mb-1 whitespace-nowrap overflow-hidden text-ellipsis text-sm sm:text-base",
                    compact ? "block max-w-full" : "inline-block max-w-[11rem] max-sm:max-w-[10rem]",
                    "hover:underline transition-colors text-gray-900 dark:text-white"
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
                    isOnline ? "text-green-500" : "text-slate-500 dark:text-slate-400"
                )}
            >
                {isOnline && (
                    <span className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                )}
                <span className="truncate">{statusText}</span>
            </div>
        </RowLayout>
    );
}

function PlayerRowError() {
    const t = useTranslations('players.list');
    return (
        <TableRow>
            <TableCell colSpan={2} className="text-center py-4">
                <div className="flex items-center justify-center gap-2 p-2 rounded bg-red-500/10 text-red-500">
                    <span role="img" aria-label="warning">⚠️</span>
                    <span>{t('unableToLoad')}</span>
                </div>
            </TableCell>
        </TableRow>
    );
}

export function PlayerTableRowLoading({ showRank = false, compact = false }: RowOptions = {}) {
    // The server renders the minimum width; the random width only appears after hydration.
    const hydrated = useHydrated();
    const randomNameWidth = simpleRandom(80, 130, hydrated);

    return (
        <RowLayout
            showRank={showRank}
            compact={compact}
            avatar={<>
                <Skeleton className="w-[40px] h-[40px] rounded-[8%]" />
                {showRank && (
                    <Skeleton className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 h-3.5 w-9 rounded-full" />
                )}
            </>}
            value={
                <Skeleton className={cn("inline-flex py-1 sm:py-1.5 rounded font-medium", compact ? "px-2 min-w-[48px] text-xs" : "px-2 sm:px-3 min-w-[60px] sm:min-w-[90px] text-xs sm:text-sm")}>
                    {'​'}
                </Skeleton>
            }
        >
            <span className="font-semibold tracking-wide mb-1 inline-block max-w-full text-sm sm:text-base">
                <SkeletonText
                    className={cn("h-4 sm:h-5 max-w-[6rem]", compact ? "max-w-full" : "sm:max-w-none")}
                    style={{ width: `${randomNameWidth}px` }}
                />
            </span>
            <div className="text-[10px] sm:text-xs flex items-center">
                <span>
                    <SkeletonText className={cn("h-3 sm:h-3.5 w-24", !compact && "sm:w-40")} />
                </span>
            </div>
        </RowLayout>
    );
}

export default function PlayerTableRow(props: PlayerTableRowProps) {
    return (
        <ErrorBoundary fallback={<PlayerRowError />}>
            <PlayerInformation {...props} />
        </ErrorBoundary>
    );
}
