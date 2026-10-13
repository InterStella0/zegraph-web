'use client'
import {useTranslations} from 'next-intl';
import {ReactElement, ReactNode, use, useEffect, useRef, useState} from "react";
import {fetchApiServerUrl, StillCalculate} from "utils/generalUtils";
import { Card, CardContent } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Skeleton } from "components/ui/skeleton";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page";
import {PlayerSession, PlayerSessionPage} from "types/players.ts";
import PaginationPage from "components/ui/PaginationPage.tsx";
import SessionDateFilter from "./SessionDateFilter";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {periodBounds, usePlayerPeriod} from "../../app/servers/[server_slug]/players/[player_id]/PlayerPeriod.tsx";
import {usePlayerStatSeed} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";

dayjs.extend(utc);
dayjs.extend(timezone);

function SessionSkeleton({ index }: { index: number }) {
    return (
        <Card className="my-1">
            <CardContent className="m-0">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                        <Skeleton className="h-[22px]" style={{ width: 90 + (index * 7) % 15 }} />
                        <span className="hidden sm:block text-sm text-muted-foreground">
                            →
                        </span>
                        <Skeleton className="h-[22px]" style={{ width: 90 + (index * 11) % 15 }} />
                    </div>
                    <Skeleton className="h-[22px] rounded-full" style={{ width: 35 + (index * 13) % 40 }} />
                </div>
            </CardContent>
        </Card>
    );
}

function SessionRow({ session, server, player }) {
    const t = useTranslations('players.sessions');
    const playerId = player.id
    const calculateDuration = (startedAt: string, endedAt: string) => {
        if (!endedAt) return t('ongoing');
        const start = dayjs(startedAt);
        const end = dayjs(endedAt);
        const duration = end.diff(start, 'minute');
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    const isOngoing = (endedAt: string) => !endedAt;

    return (
        <HoverPrefetchLink href={`/servers/${server.gotoLink}/players/${playerId}/sessions/${session.id}`}>
            <Card className="hover:bg-accent cursor-pointer transition-colors my-1">
                <CardContent>
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                {dayjs(session.started_at).format('MMM DD, h:mm a')}
                            </p>
                            <span className="hidden sm:block text-xs sm:text-sm text-muted-foreground">
                                →
                            </span>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                {isOngoing(session.ended_at)
                                    ? t('ongoing'): dayjs(session.ended_at).format('MMM DD, h:mm a')
                                }
                            </p>
                        </div>
                        <div className="flex gap-1 items-center shrink-0">
                            <Badge
                                variant={isOngoing(session.ended_at) ? 'default' : 'secondary'}
                                className="font-bold text-xs"
                            >
                                {calculateDuration(session.started_at, session.ended_at)}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </HoverPrefetchLink>
    );
}

export default function PlayerSessionList({ serverPlayerPromise, heading }: {
    serverPlayerPromise: Promise<ServerPlayerDetailed>,
    heading?: ReactNode,
}): ReactElement {
    const t = useTranslations('players.sessions');
    const { server, player } = use(serverPlayerPromise)
    const server_id = server.id
    const playerId = !(player instanceof StillCalculate)? player.id: null
    const { period } = usePlayerPeriod();
    const { seed, idle } = usePlayerStatSeed<PlayerSessionPage>('sessions', !period);
    const [loading, setLoading] = useState<boolean>(seed === null);
    const [sessionList, setSessionList] = useState<PlayerSession[]>(seed?.rows ?? []);
    const [page, setPage] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(seed?.total_pages ?? 1);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const isFirstRun = useRef(seed !== null);
    const [shownPeriod, setShownPeriod] = useState(period);
    if (shownPeriod !== period) {
        setShownPeriod(period);
        setPage(0);
        setSelectedDate(undefined);
    }
    const bounds = period ? periodBounds(period) : null;
    const firstDay = bounds ? dayjs(dayjs.utc(bounds.start).format('YYYY-MM-DD')).toDate() : undefined;
    const lastDay = bounds ? dayjs(dayjs.utc(bounds.end).subtract(1, 'day').format('YYYY-MM-DD')).toDate() : undefined;

    useEffect(() => {
        if (!playerId || idle) return;
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }

        setLoading(true);
        const abort = new AbortController();
        const params: { page: number, datetime?: string, period?: string } = { page };

        if (selectedDate) {
            params.datetime = dayjs(selectedDate).utc().format('YYYY-MM-DDTHH:mm:ss[Z]');
        }
        if (period) {
            params.period = period;
        }

        fetchApiServerUrl(server_id, `/players/${playerId}/sessions`, {
            params,
            signal: abort.signal
        }).then((data: PlayerSessionPage) => {
                setSessionList(data.rows);
                setTotalPages(data.total_pages);
                setLoading(false);
            })
            .catch((error) => {
                if (error.name !== 'AbortError') {
                    console.error('Failed to fetch sessions:', error);
                    setLoading(false);
                }
            });

        return () => {
            abort.abort();
        };
    }, [server_id, playerId, page, selectedDate, period]);

    const handleDateChange = (newDate: Date | undefined) => {
        setSelectedDate(newDate);
        setPage(0);
    };

    return (
        <div className="w-full">
            <div className="mb-3 flex flex-row flex-wrap justify-between items-center gap-2">
                {heading ?? <h2 className="text-lg sm:text-xl font-semibold">
                    {t('title')}
                </h2>}
                <SessionDateFilter selectedDate={selectedDate} onSelectDate={handleDateChange} firstDay={firstDay} lastDay={lastDay} />
            </div>

            <div className="h-[525px] overflow-y-auto mb-3 pr-2">
                <div className="space-y-2">
                    {loading ? (
                        Array.from({ length: 10 }).map((_, index) => (
                            <SessionSkeleton key={index} index={index} />
                        ))
                    ) : (
                        sessionList.map((session) => (
                            <SessionRow key={session.id} session={session} player={player} server={server} />
                        ))
                    )}
                </div>
                {sessionList.length === 0 && !loading && (
                    <div className="text-center py-8">
                        <p className="text-muted-foreground">
                            {t('noSessions')}
                        </p>
                    </div>
                )}
            </div>

            <div className="flex justify-center mt-3 px-2 min-h-9">
                {totalPages > 1 && (
                    <PaginationPage totalPages={totalPages} page={page} setPage={setPage} />
                )}
            </div>
        </div>
    );
}
