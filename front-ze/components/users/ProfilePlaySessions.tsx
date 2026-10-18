'use client'
import { useLocale, useTranslations } from 'next-intl';
import { ReactElement, use, useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { color } from "chart.js/helpers";

import { fetchApiUrl, formatNumber, simpleRandom } from "utils/generalUtils";
import { formatDuration } from "utils/sessionUtils";
import { GlobalPlayerSession, GlobalPlayerSessionPage } from "types/players.ts";
import { Badge } from "components/ui/badge";
import { Card, CardContent } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import { useLocalDayjs } from "lib/hooks/useHydrated";
import PaginationPage from "components/ui/PaginationPage.tsx";
import SessionDateFilter from "components/players/SessionDateFilter";
import { useResource } from "lib/hooks/useResource";
import { useProfileCommunities } from "./ProfileContext";
import { ENTER, LIFT, SWAP, stagger } from "./profileMotion";

dayjs.extend(utc);
dayjs.extend(timezone);

const CARD = "flex h-full flex-col border-border/40 bg-card/50 backdrop-blur-xl";
const LIST = "min-h-[240px] flex-1 overflow-y-auto px-1 py-1 space-y-2 contain-size";

function SessionSkeleton() {
    const [isClient, setIsClient] = useState<boolean>(false);
    useEffect(() => {
        setIsClient(true);
    }, []);
    return (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
            <Skeleton className="h-9 w-1 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-[15px]" style={{ width: simpleRandom(140, 190, isClient) }} />
                <Skeleton className="h-[12px]" style={{ width: simpleRandom(60, 110, isClient) }} />
            </div>
            <Skeleton className="h-[20px] shrink-0 rounded-full" style={{ width: simpleRandom(36, 55, isClient) }} />
        </div>
    );
}

function SessionRow({ session, index }: { session: GlobalPlayerSession, index: number }): ReactElement {
    const t = useTranslations('players.sessions');
    const toDayjs = useLocalDayjs();
    const { communityOf, colorOf } = useProfileCommunities();
    const community = communityOf(session.community_id);
    const where = community?.name ?? session.community_name ?? session.server_name ?? t('unknownServer');
    const accent = colorOf(session.community_id);
    const start = toDayjs(session.started_at);
    const end = session.ended_at ? toDayjs(session.ended_at) : null;
    const endFormat = end && !end.isSame(start, 'day') ? 'MMM D, h:mm a' : 'h:mm a';

    return (
        <Link
            href={`/servers/${session.server_id}/players/${session.player_id}/sessions/${session.id}`}
            className={`flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 hover:border-primary/60 hover:bg-accent/40 ${LIFT} ${SWAP}`}
            style={stagger(index)}
        >
            <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" suppressHydrationWarning>
                    {start.format('MMM D, h:mm a')} → {end ? end.format(endFormat) : t('ongoing')}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={session.server_name ?? undefined}>{where}</p>
            </div>
            <Badge
                variant="secondary"
                className="shrink-0 px-2 text-[11px] font-bold tabular-nums"
                style={{ backgroundColor: color(accent).alpha(0.2).rgbString(), color: accent }}
            >
                {end ? formatDuration(session.started_at, session.ended_at) : t('ongoing')}
            </Badge>
        </Link>
    );
}

export function ProfilePlaySessionsLoading(): ReactElement {
    const t = useTranslations('players.sessions');
    return (
        <Card className={CARD}>
            <CardContent className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold">{t('title')}</h2>
                    <Skeleton className="h-8 w-28" />
                </div>
                <div className={LIST}>
                    {Array.from({ length: 6 }).map((_, index) => (<SessionSkeleton key={index} />))}
                </div>
            </CardContent>
        </Card>
    );
}

export default function ProfilePlaySessions({ userId, initialDataPromise }: {
    userId: string,
    initialDataPromise: Promise<GlobalPlayerSessionPage | null>,
}): ReactElement {
    const t = useTranslations('players.sessions');
    const tProfile = useTranslations('players.profile');
    const locale = useLocale();
    const initialData = use(initialDataPromise);
    const [page, setPage] = useState<number>(0);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

    const { data, loading } = useResource<GlobalPlayerSessionPage>(signal => {
        const params: { page: number, datetime?: string } = { page };
        if (selectedDate) {
            params.datetime = dayjs(selectedDate).utc().format('YYYY-MM-DDTHH:mm:ss[Z]');
        }
        return fetchApiUrl(`/players/${userId}/sessions`, { params, signal });
    }, [userId, page, selectedDate], { initial: initialData ?? undefined, keepData: true, errorLog: 'Failed to fetch global sessions:' });
    const sessionList: GlobalPlayerSession[] = data?.rows ?? [];
    const totalPages = data?.total_pages ?? 1;

    const handleDateChange = (newDate: Date | undefined) => {
        setSelectedDate(newDate);
        setPage(0);
    };

    return (
        <Card className={`${CARD} ${ENTER} delay-150`}>
            <CardContent className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-semibold">{t('title')}</h2>
                        {data && (
                            <Badge variant="secondary" className="text-xs">
                                {tProfile('total', { count: formatNumber(data.total_rows ?? 0, 0, locale) })}
                            </Badge>
                        )}
                    </div>
                    <SessionDateFilter selectedDate={selectedDate} onSelectDate={handleDateChange} compact />
                </div>

                <div className={LIST}>
                    {loading ? (
                        Array.from({ length: 6 }).map((_, index) => (<SessionSkeleton key={index} />))
                    ) : sessionList.length > 0 ? (
                        sessionList.map((session, index) => (
                            <SessionRow key={session.id} session={session} index={index} />
                        ))
                    ) : (
                        <div className="flex h-full items-center justify-center text-center">
                            <p className="text-sm text-muted-foreground">{t('noSessions')}</p>
                        </div>
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="mt-3 flex justify-center">
                        <PaginationPage totalPages={totalPages} page={page} setPage={setPage} compact />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
