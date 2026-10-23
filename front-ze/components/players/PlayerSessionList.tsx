'use client'
import {useTranslations} from 'next-intl';
import {ReactElement, ReactNode, useState} from "react";
import {fetchApiServerUrl, range} from "utils/generalUtils";
import { Card, CardContent } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Skeleton } from "components/ui/skeleton";
import dayjs from "lib/dayjs";
import {PlayerSession, PlayerSessionPage} from "types/players.ts";
import {Server} from "types/community";
import PaginationPage from "components/ui/PaginationPage.tsx";
import SessionDateFilter from "./SessionDateFilter";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {periodBounds, usePeriod} from "components/period/Period";
import {usePlayerStatSeed} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import {useResource} from "lib/hooks/useResource";
import {ServerPlayerProps, useServerPlayer} from "./common";

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

function formatMinutes(total: number) {
    const hours = Math.floor(total / 60);
    return hours > 0 ? `${hours}h ${total % 60}m` : `${total % 60}m`;
}

function SessionRow({ session, server, playerId }: { session: PlayerSession, server: Server, playerId: string }) {
    const t = useTranslations('players.sessions');
    const toDayjs = useLocalDayjs();
    const duration = session.ended_at
        ? formatMinutes(dayjs(session.ended_at).diff(dayjs(session.started_at), 'minute'))
        : t('ongoing');

    return (
        <HoverPrefetchLink href={`/servers/${server.gotoLink}/players/${playerId}/sessions/${session.id}`}>
            <Card className="hover:bg-accent cursor-pointer transition-colors my-1">
                <CardContent>
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                {toDayjs(session.started_at).format('MMM DD, h:mm a')}
                            </p>
                            <span className="hidden sm:block text-xs sm:text-sm text-muted-foreground">
                                →
                            </span>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                {session.ended_at ? toDayjs(session.ended_at).format('MMM DD, h:mm a') : t('ongoing')}
                            </p>
                        </div>
                        <div className="flex gap-1 items-center shrink-0">
                            <Badge variant={session.ended_at ? 'secondary' : 'default'} className="font-bold text-xs">
                                {duration}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </HoverPrefetchLink>
    );
}

export default function PlayerSessionList({ serverPlayerPromise, heading }: ServerPlayerProps & {
    heading?: ReactNode,
}): ReactElement {
    const t = useTranslations('players.sessions');
    const { server, playerId } = useServerPlayer(serverPlayerPromise)
    const { period } = usePeriod();
    const { seed, idle } = usePlayerStatSeed<PlayerSessionPage>('sessions', !period);
    const [page, setPage] = useState<number>(0);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [shownPeriod, setShownPeriod] = useState(period);
    if (shownPeriod !== period) {
        setShownPeriod(period);
        setPage(0);
        setSelectedDate(undefined);
    }
    const bounds = period ? periodBounds(period) : null;
    const firstDay = bounds ? dayjs(dayjs.utc(bounds.start).format('YYYY-MM-DD')).toDate() : undefined;
    const lastDay = bounds ? dayjs(dayjs.utc(bounds.end).subtract(1, 'day').format('YYYY-MM-DD')).toDate() : undefined;

    const { data, loading } = useResource<PlayerSessionPage>(signal => {
        if (!playerId || idle) return null;
        const params = {
            page,
            ...(selectedDate && { datetime: dayjs(selectedDate).utc().format('YYYY-MM-DDTHH:mm:ss[Z]') }),
            ...(period && { period }),
        };
        return fetchApiServerUrl(server.id, `/players/${playerId}/sessions`, { params, signal });
    }, [server.id, playerId, page, selectedDate, period], { initial: seed ?? undefined, keepData: true, errorLog: 'Failed to fetch sessions:' });
    const sessionList = data?.rows ?? [];
    const totalPages = data?.total_pages ?? 1;

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
                    {loading
                        ? range(10).map(index => <SessionSkeleton key={index} index={index} />)
                        : sessionList.map(session => (
                            <SessionRow key={session.id} session={session} playerId={playerId} server={server} />
                        ))}
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
