'use client';

import { GlobalPlaytimeSummary, ProfileResponse } from "types/community";
import { PlayerProfilePicture, SteamProfileBackground } from "types/players";
import { UserAvatar } from "./UserAvatar";
import { ReactNode, use, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import dayjs from "lib/dayjs";
import { SiSteam } from "@icons-pack/react-simple-icons";
import { Skeleton } from "components/ui/skeleton";
import { Button } from "components/ui/button";
import { Badge } from "components/ui/badge";
import { Loader2, Share2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/ui/tooltip";
import { cn } from "components/lib/utils";
import { formatNumber, range, secondsToHours } from "utils/generalUtils";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import SplitBar, { SplitSegment } from "components/players/SplitBar";
import { SPLIT_SEGMENTS } from "components/players/PlayerStats";
import { useGlobalPlaytime } from "./useGlobalPlaytime";
import { useProfileCommunities } from "./ProfileContext";
import { ENTER, stagger } from "./profileMotion";
import { ProfileCard } from "./ProfileCard";
import ViewCount from "components/ui/ViewCount";

interface UserProfileProps {
    profilePromise: Promise<ProfileResponse>;
    pfpPromise?: Promise<PlayerProfilePicture | null>;
    viewsPromise?: Promise<number | null>;
}

const SECTION_LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

// The player's Steam profile background behind the whole page, as on their Steam profile. Fixed
// below the sakura layer (z-index -1), so the petals and the frosted profile cards sit on top.
function ProfilePageBackground({ background }: { background: SteamProfileBackground }) {
    const animated = background.video_webm || background.video_mp4;
    return (
        <div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: -2 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={background.image} alt="" className="absolute inset-0 size-full object-cover object-top" />
            {animated && (
                <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    poster={background.image}
                    className="absolute inset-0 size-full object-cover object-top motion-reduce:hidden"
                >
                    {background.video_webm && <source src={background.video_webm} type="video/webm" />}
                    {background.video_mp4 && <source src={background.video_mp4} type="video/mp4" />}
                </video>
            )}
            {/* Text outside the cards (section headings, footer) sits straight on the background. */}
            <div className="absolute inset-0 bg-background/50" />
        </div>
    );
}

export function UserProfileLoading() {
    return (
        <ProfileCard className="w-full" contentClassName="p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6">
                <Skeleton className="h-[120px] w-[120px] shrink-0 rounded-[8%]" />
                <div className="flex flex-col flex-1 items-center lg:items-start gap-3">
                    <Skeleton className="h-9 sm:h-10 w-48" />
                    <Skeleton className="h-5 w-72" />
                    <div className="flex flex-wrap gap-2">
                        {range(5).map(i => <Skeleton key={i} className="h-7 w-20" />)}
                    </div>
                </div>
                <div className="flex gap-8">
                    {range(2).map(i => (
                        <div key={i} className="flex flex-col items-end gap-1.5">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-11 w-32" />
                            <Skeleton className="h-4 w-28" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
                {range(2).map(i => (
                    <div key={i} className="space-y-3">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-2.5 w-full" />
                        <Skeleton className="h-4 w-full" />
                    </div>
                ))}
            </div>
        </ProfileCard>
    );
}

function StaleNotice({ global }: { global: GlobalPlaytimeSummary }) {
    const t = useTranslations('players.profile.stats');
    const toDayjs = useLocalDayjs();
    if (!global.is_outdated && !global.is_calculating) return null;

    const verified = global.calculated_at
        ? t('lastVerified', { ago: toDayjs(global.calculated_at).fromNow() })
        : t('neverVerified');

    return (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
            {global.is_calculating
                ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-500" />
                : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
            <div>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                    {global.is_calculating ? t('recalculatingPlaytime') : t('playtimeOutOfDate')}
                </span>
                <span className="text-muted-foreground">
                    {" "}<span suppressHydrationWarning>{t('staleNoticeBody', { verified })}</span>
                    {global.is_calculating && " " + t('freshFiguresNote')}
                </span>
            </div>
        </div>
    );
}

function Tip({ tip, children }: { tip: ReactNode, children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent><p>{tip}</p></TooltipContent>
        </Tooltip>
    );
}

function RankChip({ tooltip, href, index, children }: { tooltip: ReactNode, href?: string, index: number, children: ReactNode }) {
    return (
        <Tip tip={tooltip}>
            <Badge
                variant="outline"
                className="h-7 gap-1.5 px-2.5 text-xs font-medium tabular-nums transition-transform duration-200 hover:scale-105 motion-safe:animate-in fade-in-0 zoom-in-95 animation-duration-300 fill-mode-both"
                style={stagger(index + 4, 50)}
                asChild={!!href}
            >
                {href ? <Link href={href}>{children}</Link> : children}
            </Badge>
        </Tip>
    );
}

export default function UserProfile({ profilePromise, pfpPromise, viewsPromise }: UserProfileProps) {
    const t = useTranslations('players.profile.header');
    const tStats = useTranslations('players.stats');
    const locale = useLocale();
    const profile = use(profilePromise);
    const { communities } = useProfileCommunities();
    const toDayjs = useLocalDayjs();
    const router = useRouter();
    const pathname = usePathname();
    const steamItems = profile.steam_items;
    // Mini-profile backgrounds are made for Steam's small hover card and don't hold up full-page.
    const background = steamItems?.profile_background;
    const { steamid, name, summary } = profile;
    const global = useGlobalPlaytime(steamid, summary.global);
    const { rank, total_ranked_players, is_calculating, is_outdated } = global;
    const displayName = name || t('unknownUser');

    const wasCalculating = useRef(summary.global.is_calculating);
    useEffect(() => {
        if (wasCalculating.current && !is_calculating) {
            router.refresh();
        }
        wasCalculating.current = is_calculating;
    }, [is_calculating, router]);

    const lastCommunity = useMemo(() => {
        const entries = communities.flatMap(community =>
            community.detail.servers.map(server => ({ community, server })));
        const online = entries.find(entry => entry.server.is_online);
        if (online) return online.community;
        const latest = entries
            .filter(entry => entry.server.last_played)
            .sort((a, b) => dayjs(b.server.last_played).diff(dayjs(a.server.last_played)))[0];
        return latest?.community ?? null;
    }, [communities]);

    const mapStyle = useMemo(() => {
        const players = communities.flatMap(community => community.detail.servers.map(server => server.player));
        const sum = (field: 'casual_playtime' | 'mixed_playtime' | 'tryhard_playtime' | 'total_playtime') =>
            players.reduce((total, player) => total + player[field], 0);
        const split = { casual: sum('casual_playtime'), mixed: sum('mixed_playtime'), tryhard: sum('tryhard_playtime') };
        const untagged = Math.max(sum('total_playtime') - split.casual - split.mixed - split.tryhard, 0);
        const values = { ...split, untagged };
        return SPLIT_SEGMENTS.map(({ key, className }) => ({ key, label: tStats(key), value: values[key], className }));
    }, [communities, tStats]);

    const formatHours = (seconds: number) => secondsToHours(seconds, locale);
    const formatInt = (value: number) => formatNumber(value, 0, locale);
    const ranked = communities.filter(community => community.detail.rank);
    const splits: [string, SplitSegment[]][] = [
        ['playtimeByCommunity', communities.map(({ id, name, playtime, color }) => ({ key: id, label: name, value: playtime, color }))],
        ['mapStyle', mapStyle],
    ];
    const bestMap = summary.best_map_rank;

    const handleShareProfile = async () => {
        const path = pathname.replace(/\/players\/[^/]+/, `/players/${steamid}`);
        const url = `${window.location.origin}${path}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t('shareLinkCopied'));
        } catch {
            toast.error(t('shareLinkCopyFailed'));
        }
    };

    const seenOn = lastCommunity?.name;
    const time = summary.last_online && toDayjs(summary.last_online).fromNow();
    let status = t('neverSeen');
    if (summary.is_online) status = lastCommunity ? t('onlineOn', { community: seenOn }) : t('online');
    else if (time) status = lastCommunity ? t('lastSeenOn', { time, community: seenOn }) : t('lastSeen', { time });

    return (
        <>
            {background && <ProfilePageBackground background={background} />}
            <ProfileCard className={cn("w-full", ENTER)} contentClassName="p-6 sm:p-8">
                <StaleNotice global={global} />
                <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6">
                    <div className="relative shrink-0">
                        <UserAvatar
                            userId={steamid}
                            pfpPromise={pfpPromise}
                            name={displayName}
                            width={120}
                            height={120}
                            frame={steamItems?.avatar_frame}
                            animatedAvatar={steamItems?.animated_avatar}
                        />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col items-center lg:items-start text-center lg:text-left gap-3">
                        <div className="flex items-center justify-center lg:justify-start gap-3 flex-wrap">
                            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-all">
                                {displayName}
                            </h1>
                            <span
                                className={cn("size-3 rounded-full", summary.is_online
                                    ? "bg-green-500 animate-pulse"
                                    : "bg-muted-foreground/40")}
                                aria-label={summary.is_online ? t('online') : t('offline')}
                            />
                            <Tip tip={t('viewSteamProfile')}>
                                <Button variant="ghost" size="icon" className="rounded-full" asChild>
                                    <a href={`https://steamcommunity.com/profiles/${steamid}`} target="_blank" rel="noopener noreferrer">
                                        <SiSteam />
                                    </a>
                                </Button>
                            </Tip>
                        </div>

                        <div className="flex items-center justify-center lg:justify-start gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs font-mono">
                                ID: {steamid}
                            </Badge>
                            <span className="text-sm text-muted-foreground" suppressHydrationWarning>
                                {summary.is_online ? null : `${t('offline')} · `}{status}
                            </span>
                            {viewsPromise && <ViewCount
                                viewsPromise={viewsPromise}
                                className="text-sm text-muted-foreground"
                                iconClassName="size-4"
                            />}
                        </div>

                        <div className="flex flex-wrap justify-center lg:justify-start gap-2">
                            {rank != null && (
                                <RankChip index={0} tooltip={t('globalRankTooltip', {
                                    rank: formatInt(rank),
                                    total: formatInt(total_ranked_players),
                                })}>
                                    {t('globalChip', { rank: formatInt(rank) })}
                                </RankChip>
                            )}
                            {bestMap && (
                                <RankChip
                                    index={1}
                                    href={`/maps/${bestMap.map}`}
                                    tooltip={t('bestMapTooltip', {
                                        map: bestMap.map,
                                        rank: formatInt(bestMap.rank),
                                        total: formatInt(bestMap.total_players),
                                    })}
                                >
                                    {bestMap.map} · #{formatInt(bestMap.rank)}
                                </RankChip>
                            )}
                            {ranked.map((community, i) => (
                                <RankChip
                                    key={community.id}
                                    index={2 + i}
                                    tooltip={t('communityRankTooltip', {
                                        community: community.name,
                                        rank: formatInt(community.detail.rank.rank),
                                        total: formatInt(community.detail.rank.total_players),
                                    })}
                                >
                                    <span className="size-2 rounded-sm" style={{ backgroundColor: community.color }} aria-hidden />
                                    {community.tag} #{formatInt(community.detail.rank.rank)}
                                </RankChip>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col items-center lg:items-end gap-4">
                        <div className="flex flex-wrap justify-center lg:justify-end gap-8 text-center lg:text-right">
                            <div>
                                <div className="flex items-center justify-center lg:justify-end gap-1.5">
                                    <span className={SECTION_LABEL}>{t('globalRank')}</span>
                                    {is_calculating && (
                                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" aria-label={t('recalculating')} />
                                    )}
                                    {is_outdated && !is_calculating && (
                                        <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" aria-label={t('outOfDate')} />
                                    )}
                                </div>
                                {rank != null ? (
                                    <>
                                        <p className={cn("mt-1 text-4xl sm:text-5xl font-bold leading-none tracking-tight tabular-nums", is_outdated
                                            ? "text-muted-foreground"
                                            : "bg-gradient-to-br from-fuchsia-600 to-pink-600 bg-clip-text text-transparent")}>
                                            #{formatInt(rank)}
                                        </p>
                                        <p className="mt-1.5 text-xs text-muted-foreground">
                                            {t('ofTotalPlayers', { total: formatInt(total_ranked_players) })}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground mt-2">{t('notEnoughPlaytime')}</p>
                                )}
                            </div>
                            <div>
                                <span className={SECTION_LABEL}>{t('totalPlaytime')}</span>
                                <p className="mt-1 flex items-baseline justify-center lg:justify-end gap-1.5">
                                    <span className="text-4xl sm:text-5xl font-bold leading-none tracking-tight tabular-nums">
                                        {formatHours(summary.total_playtime)}
                                    </span>
                                    <span className="text-base text-muted-foreground">{t('hrs')}</span>
                                </p>
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    {t('communitiesServers', {
                                        communities: summary.community_count,
                                        servers: summary.server_count,
                                    })}
                                </p>
                            </div>
                        </div>
                        {profile.is_owner && (
                            <Button variant="default" size="sm" onClick={handleShareProfile}>
                                <Share2 className="h-4 w-4 mr-1.5" />
                                {t('shareProfile')}
                            </Button>
                        )}
                    </div>
                </div>

                {communities.length > 0 && (
                    <div className="mt-8 grid gap-x-10 gap-y-6 lg:grid-cols-2">
                        {splits.map(([key, segments]) => (
                            <div key={key}>
                                <span className={cn(SECTION_LABEL, "mb-2 block")}>{t(key)}</span>
                                <SplitBar ariaLabel={t(key)} formatValue={formatHours} segments={segments} />
                            </div>
                        ))}
                    </div>
                )}
            </ProfileCard>
        </>
    );
}
