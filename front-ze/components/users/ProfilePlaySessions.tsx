'use client'
import { useTranslations } from 'next-intl';
import { ReactElement, useEffect, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

import { fetchApiUrl, simpleRandom } from "utils/generalUtils";
import { formatDuration } from "utils/sessionUtils";
import { GlobalPlayerSession, GlobalPlayerSessionPage } from "types/players.ts";
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar";
import { Badge } from "components/ui/badge";
import { Button } from "components/ui/button";
import { Calendar } from "components/ui/calendar";
import { Card, CardContent } from "components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "components/ui/popover";
import { Skeleton } from "components/ui/skeleton";
import { getServerAvatarText } from "components/ui/CommunitySelector.tsx";
import { cn } from "components/lib/utils";
import PaginationPage from "components/ui/PaginationPage.tsx";

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
        <Card className="my-1">
            <CardContent className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-[18px]" style={{ width: simpleRandom(140, 160, isClient) }} />
                    <Skeleton className="h-[14px]" style={{ width: simpleRandom(100, 170, isClient) }} />
                </div>
                <Skeleton className="h-[22px] shrink-0 rounded-full" style={{ width: simpleRandom(35, 75, isClient) }} />
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
        <Card className="my-1">
            <CardContent className="flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                    {session.community_icon_url && (
                        <AvatarImage src={session.community_icon_url} alt={session.community_name ?? ''} />
                    )}
                    <AvatarFallback className="text-xs font-bold">{avatarText}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                        {dayjs(session.started_at).format('MMM DD, YYYY h:mm a')}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{serverName}</p>
                </div>
                <Badge
                    variant={session.ended_at ? 'secondary' : 'default'}
                    className="shrink-0 text-xs font-bold"
                >
                    {session.ended_at
                        ? formatDuration(session.started_at, session.ended_at)
                        : t('ongoing')}
                </Badge>
            </CardContent>
        </Card>
    );
}

/**
 * A player's sessions across every server, for the global profile page.
 *
 * Fetches client-side rather than taking a server-started promise: the list is driven by page and
 * date-filter state, so the client fetch path has to exist regardless, and the section sits below
 * the fold on a page that has no Suspense boundaries.
 *
 * `userId` may be the literal `"me"` — `fetchApiUrl` routes through `/api`, which attaches the JWT.
 */
export default function ProfilePlaySessions({ userId }: { userId: string }): ReactElement {
    const t = useTranslations('players.sessions');
    const [loading, setLoading] = useState<boolean>(true);
    const [sessionList, setSessionList] = useState<GlobalPlayerSession[]>([]);
    const [page, setPage] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [datePickerOpen, setDatePickerOpen] = useState(false);

    useEffect(() => {
        setLoading(true);
        const abort = new AbortController();
        const params: { page: number, datetime?: string } = { page };

        if (selectedDate) {
            params.datetime = dayjs(selectedDate).utc().format('YYYY-MM-DDTHH:mm:ss[Z]');
        }

        fetchApiUrl(`/players/${userId}/sessions`, { params, signal: abort.signal })
            .then((data: GlobalPlayerSessionPage) => {
                setSessionList(data.rows);
                setTotalPages(data.total_pages);
                setLoading(false);
            })
            .catch((error) => {
                if (error.name !== 'AbortError') {
                    console.error('Failed to fetch global sessions:', error);
                    setLoading(false);
                }
            });

        return () => { abort.abort(); };
    }, [userId, page, selectedDate]);

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
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardContent>
                <div className="mb-3 flex items-center gap-4 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-semibold">{t('title')}</h2>
                    <div className="flex gap-2 items-center">
                        {selectedDate && (
                            <Button variant="ghost" size="icon" onClick={handlePreviousDay}>
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
                                <Calendar mode="single" selected={selectedDate} onSelect={handleDateChange} />
                            </PopoverContent>
                        </Popover>
                        {selectedDate && (
                            <Button variant="ghost" size="icon" onClick={handleNextDay}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        )}
                        {selectedDate && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setSelectedDate(undefined); setPage(0); }}
                            >
                                {t('clear')}
                            </Button>
                        )}
                    </div>
                </div>

                <div className="max-h-[525px] overflow-y-auto mb-3 pr-2">
                    <div className="space-y-2">
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
                        <p className="text-muted-foreground">{t('noSessions')}</p>
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="flex justify-center mt-3 px-2">
                        <PaginationPage totalPages={totalPages} page={page} setPage={setPage} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
