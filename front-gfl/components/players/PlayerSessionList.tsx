'use client'
import {useTranslations} from 'next-intl';
import {ReactElement, use, useEffect, useState} from "react";
import {fetchApiServerUrl, simpleRandom, StillCalculate} from "utils/generalUtils";
import { Card, CardContent } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Button } from "components/ui/button";
import { Skeleton } from "components/ui/skeleton";
import { Calendar } from "components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "components/ui/popover";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page";
import Link from "next/link";
import {PlayerSession, PlayerSessionPage} from "types/players.ts";
import { cn } from "components/lib/utils";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";

dayjs.extend(utc);
dayjs.extend(timezone);

function SessionSkeleton() {
    const [isClient, setIsClient] = useState<boolean>(false);
    useEffect(() => {
        setIsClient(true);
    }, []);
    return (
        <Card className="my-1">
            <CardContent className="m-0">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                        <Skeleton className="h-[22px] w-24" style={{ width: simpleRandom(90, 105, isClient) }} />
                        <span className="hidden sm:block text-sm text-muted-foreground">
                            →
                        </span>
                        <Skeleton className="h-[22px] w-24" style={{ width: isClient ? simpleRandom(90, 105) : 90 }} />
                    </div>
                    <Skeleton className="h-[22px] rounded-full" style={{ width: simpleRandom(35, 75, isClient) }} />
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

export default function PlayerSessionList({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed>}): ReactElement {
    const t = useTranslations('players.sessions');
    const { server, player } = use(serverPlayerPromise)
    const server_id = server.id
    const playerId = !(player instanceof StillCalculate)? player.id: null
    const [loading, setLoading] = useState<boolean>(true);
    const [sessionList, setSessionList] = useState<PlayerSession[]>([]);
    const [page, setPage] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [datePickerOpen, setDatePickerOpen] = useState(false);

    useEffect(() => {
        if (!playerId) return;

        setLoading(true);
        const abort = new AbortController();
        const params: { page: number, datetime?: string } = { page };

        if (selectedDate) {
            params.datetime = dayjs(selectedDate).utc().format('YYYY-MM-DDTHH:mm:ss[Z]');
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
    }, [server_id, playerId, page, selectedDate]);

    const handleDateChange = (newDate: Date | undefined) => {
        setSelectedDate(newDate);
        setPage(0);
        setDatePickerOpen(false);
    };

    const handlePreviousDay = () => {
        if (selectedDate) {
            setSelectedDate(dayjs(selectedDate).subtract(1, 'day').toDate());
            setPage(0);
        }
    };

    const handleNextDay = () => {
        if (selectedDate) {
            setSelectedDate(dayjs(selectedDate).add(1, 'day').toDate());
            setPage(0);
        }
    };

    return (
        <div className="w-full">
            <div className="mb-3 flex items-center gap-4 flex-wrap">
                <h2 className="text-lg sm:text-xl font-semibold">
                    {t('title')}
                </h2>
                <div className="flex gap-2 items-center">
                    {selectedDate && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handlePreviousDay}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    )}
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "min-w-[140px] sm:min-w-[200px] justify-start text-left font-normal",
                                    !selectedDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {selectedDate ? dayjs(selectedDate).format('MMM DD, YYYY') : t('filterByDate')}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={handleDateChange}
                            />
                        </PopoverContent>
                    </Popover>
                    {selectedDate && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleNextDay}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    )}
                    {selectedDate && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSelectedDate(undefined);
                                setPage(0);
                            }}
                        >
                            {t('clear')}
                        </Button>
                    )}
                </div>
            </div>

            <div className="max-h-[525px] overflow-y-auto mb-3 pr-2">
                <div className="space-y-2">
                    {loading ? (
                        Array.from({ length: 10 }).map((_, index) => (
                            <SessionSkeleton key={index} />
                        ))
                    ) : (
                        sessionList.map((session) => (
                            <SessionRow key={session.id} session={session} player={player} server={server} />
                        ))
                    )}
                </div>
            </div>

            {sessionList.length === 0 && !loading && (
                <div className="text-center py-8">
                    <p className="text-muted-foreground">
                        {t('noSessions')}
                    </p>
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex justify-center mt-3 px-2" >
                    <PaginationPage totalPages={totalPages} page={page} setPage={setPage} />
                </div>
            )}
        </div>
    );
}
