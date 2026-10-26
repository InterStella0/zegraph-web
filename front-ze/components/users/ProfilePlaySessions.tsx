'use client'
import { useLocale, useTranslations } from 'next-intl';
import { useState } from "react";
import Link from "next/link";
import dayjs from "lib/dayjs";

import { fetchApiUrl, formatNumber, range, simpleRandom } from "utils/generalUtils";
import { formatDuration } from "utils/sessionUtils";
import { GlobalPlayerSession, GlobalPlayerSessionPage } from "types/players.ts";
import { Badge } from "components/ui/badge";
import { Skeleton } from "components/ui/skeleton";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import {useHydrated} from "lib/hooks/useHydrated";
import PaginationPage from "components/ui/PaginationPage.tsx";
import SessionDateFilter from "components/players/SessionDateFilter";
import { useResource } from "lib/hooks/useResource";
import { useProfileCommunities } from "./ProfileContext";
import { ENTER, LIFT, SWAP, stagger } from "./profileMotion";
import { ISLAND, ProfileCard, ProfileCardHeader, ProfileCardLoading } from "./ProfileCard";
import { tint } from "./profileChart";

const CARD = "flex h-full flex-col";
const CONTENT = "flex min-h-0 flex-1 flex-col";
const LIST = "min-h-[240px] flex-1 overflow-y-auto px-1 py-1 space-y-2 contain-size";

function SessionSkeletons() {
    // Random widths only after hydration; the server and the first client render use the minimum.
    const hydrated = useHydrated();
    return range(6).map(index => (
        <div key={index} className={`flex items-center gap-3 rounded-lg border border-border/60 p-3 ${ISLAND}`}>
            <Skeleton className="h-9 w-1 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-[15px]" style={{ width: simpleRandom(140, 190, hydrated) }} />
                <Skeleton className="h-[12px]" style={{ width: simpleRandom(60, 110, hydrated) }} />
            </div>
            <Skeleton className="h-[20px] shrink-0 rounded-full" style={{ width: simpleRandom(36, 55, hydrated) }} />
        </div>
    ));
}

function SessionRow({ session, index }: { session: GlobalPlayerSession, index: number }) {
    const t = useTranslations('players.sessions');
    const toDayjs = useLocalDayjs();
    const { communityOf, colorOf } = useProfileCommunities();
    const where = communityOf(session.community_id)?.name ?? session.community_name ?? session.server_name ?? t('unknownServer');
    const accent = colorOf(session.community_id);
    const start = toDayjs(session.started_at);
    const end = session.ended_at ? toDayjs(session.ended_at) : null;
    const endFormat = end && !end.isSame(start, 'day') ? 'MMM D, h:mm a' : 'h:mm a';

    return (
        <Link
            href={`/servers/${session.server_id}/players/${session.player_id}/sessions/${session.id}`}
            className={`flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 hover:border-primary/60 hover:bg-accent/40 ${ISLAND} ${LIFT} ${SWAP}`}
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
                style={{ backgroundColor: tint(accent, 0.2), color: accent }}
            >
                {end ? formatDuration(session.started_at, session.ended_at) : t('ongoing')}
            </Badge>
        </Link>
    );
}

export function ProfilePlaySessionsLoading() {
    const t = useTranslations('players.sessions');
    return (
        <ProfileCardLoading className={CARD} contentClassName={CONTENT} title={t('title')} controlSize="h-8 w-28">
            <div className={LIST}><SessionSkeletons /></div>
        </ProfileCardLoading>
    );
}

export default function ProfilePlaySessions({ userId, initialDataPromise }: {
    userId: string,
    initialDataPromise: Promise<GlobalPlayerSessionPage | null>,
}) {
    const t = useTranslations('players.sessions');
    const tProfile = useTranslations('players.profile');
    const locale = useLocale();
    const [page, setPage] = useState(0);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

    const { data, loading } = useResource<GlobalPlayerSessionPage>(signal => fetchApiUrl(`/players/${userId}/sessions`, {
        params: { page, ...(selectedDate && { datetime: dayjs(selectedDate).utc().format('YYYY-MM-DDTHH:mm:ss[Z]') }) },
        signal,
    }), [userId, page, selectedDate], { seed: initialDataPromise, keepData: true, errorLog: 'Failed to fetch global sessions:' });
    const sessionList = data?.rows ?? [];
    const totalPages = data?.total_pages ?? 1;

    const handleDateChange = (newDate: Date | undefined) => {
        setSelectedDate(newDate);
        setPage(0);
    };

    return (
        <ProfileCard className={`${CARD} ${ENTER} delay-150`} contentClassName={CONTENT}>
            <ProfileCardHeader
                title={t('title')}
                className="gap-2"
                badge={data && tProfile('total', { count: formatNumber(data.total_rows ?? 0, 0, locale) })}
                actions={<SessionDateFilter selectedDate={selectedDate} onSelectDate={handleDateChange} compact />}
            />

            <div className={LIST}>
                {loading ? (
                    <SessionSkeletons />
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
        </ProfileCard>
    );
}
