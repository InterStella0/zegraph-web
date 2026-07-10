'use client';

import { use, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useTranslations } from "next-intl";
import { GlobalPlaytimeSummary, ProfileResponse } from "types/community";
import { Card, CardContent } from "components/ui/card";
import { secondsToHours } from "utils/generalUtils";
import { useGlobalPlaytime } from "./useGlobalPlaytime";
import { Loader2, TriangleAlert } from "lucide-react";

dayjs.extend(relativeTime);

export default function ProfileStatsCards({ userId, profilePromise }: { userId: string; profilePromise: Promise<ProfileResponse> }) {
    const t = useTranslations('players.profile.stats');
    const { summary } = use(profilePromise);
    const global = useGlobalPlaytime(userId, summary.global);
    const router = useRouter();

    const wasCalculating = useRef(summary.global.is_calculating);
    useEffect(() => {
        if (wasCalculating.current && !global.is_calculating) {
            router.refresh();
        }
        wasCalculating.current = global.is_calculating;
    }, [global.is_calculating, router]);

    const lastOnlineLabel = summary.last_online ? dayjs(summary.last_online).fromNow() : t('never');
    const sessionLabel = summary.last_session_duration != null
        ? t('sessionHours', { hours: secondsToHours(summary.last_session_duration) })
        : null;

    const bestRank = summary.best_rank;
    const bestRankLabel = bestRank != null ? `#${bestRank.position.toLocaleString()}` : t('unranked');
    const bestRankSub = bestRank != null ? bestRank.map : t('notEnoughPlaytime');

    const stats = [
        { label: t('totalPlaytime'), value: `${secondsToHours(summary.total_playtime)}`, unit: t('hoursUnit'), sub: t('acrossCommunities', { count: summary.community_count }), derived: true },
        { label: t('bestMapRank'), value: bestRankLabel, unit: "", sub: bestRankSub, derived: true },
        { label: t('communities'), value: summary.community_count.toString(), unit: "", sub: t('joinedAndTracked'), derived: false },
        { label: t('servers'), value: summary.server_count.toString(), unit: "", sub: t('acrossAllCommunities'), derived: false },
        { label: t('lastOnline'), value: lastOnlineLabel, unit: "", sub: sessionLabel ?? (summary.is_online ? t('onlineNow') : ""), derived: false },
    ];

    return (
        <div className="flex flex-col gap-3">
            <StaleNotice global={global} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {stats.map((stat) => (
                    <Card key={stat.label} className="border-border/40 bg-card/50 backdrop-blur-xl">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {stat.label}
                                </span>
                                {stat.derived && global.is_calculating && (
                                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" aria-label={t('recalculating')} />
                                )}
                                {stat.derived && global.is_outdated && !global.is_calculating && (
                                    <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" aria-label={t('outOfDate')} />
                                )}
                            </div>
                            <div className={`mt-1 text-2xl font-bold ${stat.derived && global.is_outdated ? "text-muted-foreground" : ""}`}>
                                {stat.value}{stat.unit && <span className="text-sm font-normal text-muted-foreground ml-1">{stat.unit}</span>}
                            </div>
                            {stat.sub && (
                                <div className="text-xs text-muted-foreground mt-1">{stat.sub}</div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function StaleNotice({ global }: { global: GlobalPlaytimeSummary }) {
    const t = useTranslations('players.profile.stats');
    if (!global.is_outdated && !global.is_calculating) return null;

    const verified = global.calculated_at
        ? t('lastVerified', { ago: dayjs(global.calculated_at).fromNow() })
        : t('neverVerified');

    return (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
            {global.is_calculating
                ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-500" />
                : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
            <div>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                    {global.is_calculating ? t('recalculatingPlaytime') : t('playtimeOutOfDate')}
                </span>
                <span className="text-muted-foreground">
                    {" "}{t('staleNoticeBody', { verified })}
                    {global.is_calculating && " " + t('freshFiguresNote')}
                </span>
            </div>
        </div>
    );
}
