'use client'
import { useTranslations } from 'next-intl';
import { ReactElement, use, useEffect, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import { fetchApiUrl, simpleRandom } from "utils/generalUtils";
import { formatDuration } from "utils/sessionUtils";
import { GlobalPlayerSession, GlobalPlayerSessionPage } from "types/players.ts";
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar";
import { Badge } from "components/ui/badge";
import { Card, CardContent } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import { getServerAvatarText } from "components/ui/CommunitySelector.tsx";
import PaginationPage from "components/ui/PaginationPage.tsx";
import SessionDateFilter from "components/players/SessionDateFilter";
import { useResource } from "lib/hooks/useResource";

dayjs.extend(utc);
dayjs.extend(timezone);

function SessionSkeleton() {
    // Widths are randomized so the placeholder rows don't look like a barcode, but only after
    // mount — a random width during SSR would be a hydration mismatch.
    const [isClient, setIsClient] = useState<boolean>(false);
    useEffect(() => {
        setIsClient(true);
    }, []);
    return (
        <Card className="my-1 p-0">
            <CardContent className="flex items-center gap-2 p-2 max-sm:p-2">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-[14px]" style={{ width: simpleRandom(100, 130, isClient) }} />
                    <Skeleton className="h-[12px]" style={{ width: simpleRandom(60, 110, isClient) }} />
                </div>
                <Skeleton className="h-[18px] shrink-0 rounded-full" style={{ width: simpleRandom(30, 55, isClient) }} />
            </CardContent>
        </Card>
    );
}

/**
 * Not a link, unlike the per-server session list: the session-detail route is scoped to one server
 * and this list spans all of them.
 */
function SessionRow({ session }: { session: GlobalPlayerSession }): ReactElement {
    const t = useTranslations('players.sessions');
    const serverName = session.server_name ?? t('unknownServer');
    // getServerAvatarText indexes into the string, so it throws on an empty one.
    const avatarText = getServerAvatarText(session.community_name || serverName).toUpperCase();

    return (
        <Card className="my-1 p-0">
            <CardContent className="flex items-center gap-2 p-2 max-sm:p-2">
                <Avatar className="h-8 w-8 shrink-0">
                    {session.community_icon_url && (
                        <AvatarImage src={session.community_icon_url} alt={session.community_name ?? ''} />
                    )}
                    <AvatarFallback className="text-[10px] font-bold">{avatarText}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                        {dayjs(session.started_at).format('MMM DD, YYYY h:mm a')}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{serverName}</p>
                </div>
                <Badge
                    variant={session.ended_at ? 'secondary' : 'default'}
                    className="shrink-0 px-1.5 text-[10px] font-bold"
                >
                    {session.ended_at
                        ? formatDuration(session.started_at, session.ended_at)
                        : t('ongoing')}
                </Badge>
            </CardContent>
        </Card>
    );
}

export function ProfilePlaySessionsLoading(): ReactElement {
    const t = useTranslations('players.sessions');
    return (
        <Card className="border-border/40 bg-card/50 p-2 backdrop-blur-xl">
            <CardContent className="px-1 max-sm:px-1">
                <div className="mb-2 space-y-2">
                    <h2 className="text-base font-semibold">{t('title')}</h2>
                    <SessionDateFilter selectedDate={undefined} onSelectDate={() => {}} compact />
                </div>
                <div className="max-h-[525px] overflow-y-auto mb-2 pr-1">
                    <div className="space-y-1">
                        {Array.from({ length: 10 }).map((_, index) => (<SessionSkeleton key={index} />))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * A player's sessions across every server, for the global profile page.
 *
 * `userId` may be the literal `"me"` — `fetchApiUrl` routes through `/api`, which attaches the JWT.
 */
export default function ProfilePlaySessions({ userId, initialDataPromise }: {
    userId: string,
    initialDataPromise: Promise<GlobalPlayerSessionPage | null>,
}): ReactElement {
    const t = useTranslations('players.sessions');
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
        <Card className="border-border/40 bg-card/50 p-2 backdrop-blur-xl">
            <CardContent className="px-1 max-sm:px-1">
                <div className="mb-2 space-y-2">
                    <h2 className="text-base font-semibold">{t('title')}</h2>
                    <SessionDateFilter selectedDate={selectedDate} onSelectDate={handleDateChange} compact />
                </div>

                <div className="max-h-[525px] overflow-y-auto mb-2 pr-1">
                    <div className="space-y-1">
                        {loading ? (
                            Array.from({ length: 10 }).map((_, index) => (<SessionSkeleton key={index} />))
                        ) : (
                            sessionList.map((session) => (
                                <SessionRow key={session.id} session={session} />
                            ))
                        )}
                    </div>
                </div>

                {sessionList.length === 0 && !loading && (
                    <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">{t('noSessions')}</p>
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="flex justify-center mt-2">
                        <PaginationPage totalPages={totalPages} page={page} setPage={setPage} compact />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
