'use client'
import {ReactNode, use, useEffect, useState} from 'react'
import dayjs from "lib/dayjs";
import {Info, Activity, Bell, BellOff, Play, LucideIcon} from 'lucide-react';
import {getMapImage, fetchApiUrl, range} from "utils/generalUtils";
import Link from "next/link";
import {getContinentStatsNow, getMatchNow} from "../../app/servers/[server_slug]/maps/util";
import { ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import Image from "next/image";
import { ServerMapMatch} from "types/maps.ts";
import {Server} from "types/community.ts";
import {ContinentStatistics} from "types/players.ts";
import PlayerContinentCounter from "components/players/PlayerContinentCounter.tsx";
import {Skeleton, SkeletonBadge, SkeletonText} from "components/ui/skeleton";
import {Badge} from "components/ui/badge";
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {GAME_META} from "components/ui/ServerIndicator";
import {getServerAvatarText} from "components/ui/CommunitySelector";
import {Button} from "components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {usePushNotifications} from "lib/hooks/usePushNotifications";
import {sendJson} from "lib/sendJson";
import {toast} from "sonner";
import {SteamProfile} from "types/steam";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {useLoginDialog} from "components/ui/LoginDialog";
import {toastRequest} from "components/maps/toastRequest";
import {useTranslations} from "next-intl";

const REFRESH_MS = 65000;

export default function CurrentMatch({ serverPromise, mapCurrentPromise, playerContinentsPromise, userPromise }:
{ serverPromise: ServerSlugPromise, mapCurrentPromise: Promise<ServerMapMatch>, playerContinentsPromise: Promise<ContinentStatistics>, userPromise: Promise<SteamProfile | null> }
){
    const t = useTranslations('servers.currentMatch')
    const server = use(serverPromise)
    const serverSideCurrentMatch = use(mapCurrentPromise)
    const playerContinents = use(playerContinentsPromise)
    const user = use(userPromise)
    const server_id = server?.id;

    const [currentMatch, setCurrentMatch] = useState<ServerMapMatch>(null)
    const [continentData, setContinentData] = useState<ContinentStatistics>(null);
    const [mapImage, setMapImage] = useState<string | null>(null);

    useEffect(() => {
        if (!server_id) return;
        const refresh = () => {
            getMatchNow(server_id)
                .then(async matchData => {
                    setCurrentMatch(matchData);
                    if (matchData?.map) setMapImage((await getMapImage(server_id, matchData.map))?.large || null)
                })
                .catch(err => {
                    console.error('Failed to load current match:', err)
                    setCurrentMatch(null)
                });
            getContinentStatsNow(server_id)
                .then(setContinentData)
                .catch(err => console.error('Error fetching continent stats:', err));
        };
        refresh()
        const interval = setInterval(refresh, REFRESH_MS);
        return () => clearInterval(interval);
    }, [server_id]);

    if (!currentMatch && !serverSideCurrentMatch) {
        return (
            <div className="border border-border rounded-lg bg-card p-6 mb-6">
                <h6 className="text-lg text-muted-foreground text-center py-8">
                    {t('noActiveMatch')}
                </h6>
            </div>
        );
    }

    return <CurrentMatchDisplay server={server} mapImage={mapImage} currentMatch={currentMatch ?? serverSideCurrentMatch} continentData={continentData ?? playerContinents} user={user} />
}

/** The match card frame: image, "playing" details, and the player count column. */
function MatchLayout({ className, image, players, continents, children }: {
    className: string, image: ReactNode, players: ReactNode, continents: ReactNode, children: ReactNode,
}) {
    const t = useTranslations('servers.currentMatch');
    return (
        <div
            suppressHydrationWarning
            className={`${className} border border-border rounded-lg bg-gradient-to-br from-primary/5 via-secondary/5 to-background p-6`}
        >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-4">
                    {image}
                </div>
                <div className="md:col-span-5">
                    <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-primary">
                        <Play className="h-3 w-3 fill-current"/>
                        {t('playing')}
                    </span>
                    {children}
                </div>
                <div className="md:col-span-3">
                    <div className="flex flex-col gap-4">
                        <div className="text-center">
                            {players}
                            <span className="text-xs text-muted-foreground font-medium">
                                {t('playersUpper')}
                            </span>
                        </div>
                        {continents}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function CurrentMatchSkeleton({ className = "mb-6" }: { className?: string }) {
    const t = useTranslations('servers.currentMatch');
    return (
        <MatchLayout
            className={className}
            image={<Skeleton className="w-full h-40 rounded-lg" />}
            players={<div className="text-5xl font-bold"><SkeletonText className="h-10 w-16" /></div>}
            continents={
                <div className="mt-2">
                    <div className="space-y-3">
                        {range(3).map(i => (
                            <div key={i}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium">
                                        <SkeletonText className="h-3.5 w-24" />
                                    </span>
                                    <span className="text-sm font-semibold">
                                        <SkeletonText className="h-3.5 w-12" />
                                    </span>
                                </div>
                                <Skeleton className="h-2 w-full rounded-full" />
                            </div>
                        ))}
                    </div>
                </div>
            }
        >
            <div className="text-2xl md:text-4xl mb-2 font-bold">
                <SkeletonText className="h-6 md:h-8 w-56 max-w-full" />
            </div>
            <div className="text-sm">
                <SkeletonText className="h-3.5 w-64 max-w-full" />
            </div>
            <div className="flex gap-2 mt-2 mb-4">
                <SkeletonBadge className="w-10" />
            </div>
            <div className="flex flex-row gap-2 flex-wrap">
                {[
                    [Info, t('mapInfo')],
                    [Activity, t('matchInfo')],
                    [Play, t('join')],
                ].map(([Icon, label]: [LucideIcon, string]) => (
                    <Skeleton key={label} className="inline-flex items-center h-8 rounded-md px-3 text-sm font-medium">
                        <span className="invisible inline-flex items-center">
                            <Icon className="mr-2 h-4 w-4" />
                            {label}
                        </span>
                    </Skeleton>
                ))}
            </div>
        </MatchLayout>
    );
}

type BusyState = 'enabling-push' | 'subscribing-map' | 'unsubscribing' | null;

export function CurrentMatchDisplay({ server, mapImage, currentMatch, continentData, user, className = "mb-6", showServer = false }: {
    server: Server, mapImage: string | null, currentMatch: ServerMapMatch, continentData: ContinentStatistics, user: SteamProfile | null,
    className?: string,
    showServer?: boolean,
}) {
    const t = useTranslations('servers.currentMatch');
    const [currentTime, setCurrentTime] = useState(dayjs());
    const { isSupported, subscription, subscribe, isLoading: pushLoading } = usePushNotifications(user != null);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [busy, setBusy] = useState<BusyState>(null);
    const {openLogin, loginDialog} = useLoginDialog();

    useEffect(() => {
        if (!user || !subscription) return;
        fetchApiUrl('/accounts/me/push/map-change')
            .then((subs: Array<{id: string; server_id: string; triggered: boolean}>) =>
                setIsSubscribed(subs.some(s => s.server_id === server.id && !s.triggered)))
            .catch(error => console.error('Failed to check map change subscription:', error));
    }, [user, subscription, server.id]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(dayjs()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleUnsubscribe = async () => {
        setBusy('unsubscribing');
        await toastRequest(async () => {
            await fetchApiUrl(`/accounts/me/push/map-change/${server.id}`, { method: 'DELETE' });
            setIsSubscribed(false);
        }, { success: t('notificationCancelled'), failure: t('unsubscribeFailed'), log: 'Unsubscribe error:' });
        setBusy(null);
    };

    const handleNotificationClick = async () => {
        if (!user) {
            openLogin();
            return;
        }
        if (isSubscribed) return handleUnsubscribe();

        let subscriptionToUse: { id: string; endpoint: string } | null = subscription;
        if (!subscription) {
            setBusy('enabling-push');
            toast.info(t('requestingPermission'));
            subscriptionToUse = await subscribe();
            setBusy(null);
            if (!subscriptionToUse) {
                toast.error(t('enableNotificationsFailed'));
                return;
            }
            toast.success(t('notificationsEnabled'));
        }

        setBusy('subscribing-map');
        await toastRequest(async () => {
            await sendJson('/accounts/me/push/map-change/subscribe', 'POST', {
                server_id: server.id,
                subscription_id: subscriptionToUse.id,
            });
            setIsSubscribed(true);
        }, { success: t('willBeNotified'), failure: t('subscribeFailed'), log: 'Subscribe error:' });
        setBusy(null);
    };

    const busyLabels = {
        'enabling-push': t('enablingNotifications'),
        'subscribing-map': t('subscribing'),
        'unsubscribing': t('loading'),
    };

    const formatTimeUntilEnd = (end: string | null, prefix: string, onEnding: string) => {
        if (!end) return null;
        const diff = dayjs(end).diff(currentTime);
        if (diff <= 0) return onEnding;

        const dur = dayjs.duration(diff);
        const hours = Math.floor(dur.asHours());
        if (hours > 0) return `${prefix} ${hours}h ${dur.minutes()}m ${dur.seconds()}s`;
        if (dur.minutes() > 0) return `${prefix} ${dur.minutes()}m ${dur.seconds()}s`;
        return `${prefix} ${dur.seconds()}s`;
    };

    const formatMatchDuration = (startedAt: string) => {
        if (!startedAt) return t('unknown');
        const dur = dayjs.duration(currentTime.diff(dayjs(startedAt)));
        const hours = Math.floor(dur.asHours());
        const pad = (value: number) => value.toString().padStart(2, '0');
        return hours > 0 ? `${hours}:${pad(dur.minutes())}:${pad(dur.seconds())}` : `${dur.minutes()}:${pad(dur.seconds())}`;
    };

    const duration = formatMatchDuration(currentMatch.started_at);
    const timeUntilEnd = formatTimeUntilEnd(currentMatch.server_time_end, t('timeLeft'), t('lastRound'));
    const timeUntilEndEstimate = formatTimeUntilEnd(currentMatch.estimated_time_end, t('estimatedEndIn'), t('probablyEnding'));
    const hasScores = currentMatch.human_score !== null && currentMatch.zombie_score !== null;
    const mapHref = `/servers/${server.gotoLink}/maps/${currentMatch.map}`;

    return (
        <>
            <MatchLayout
                className={className}
                image={
                    <div className="rounded-lg overflow-hidden h-40">
                        {mapImage ? (
                            <Image
                                unoptimized
                                height={160}
                                width={468}
                                src={mapImage}
                                alt={currentMatch.map}
                                className="object-cover"
                            />
                        ) : (
                            <Skeleton className="w-full h-40" />
                        )}
                    </div>
                }
                players={
                    <h2 className="text-5xl font-bold text-primary">
                        {currentMatch.player_count || '?'}
                    </h2>
                }
                continents={continentData && continentData.total_count > 0 && <PlayerContinentCounter continentData={continentData} />}
            >
                <h4 className="text-2xl md:text-4xl mb-2 font-bold overflow-hidden text-ellipsis whitespace-nowrap max-w-[40rem]">
                    {currentMatch.map}
                </h4>

                {showServer && <MatchServerLine server={server}/>}

                <p suppressHydrationWarning className="text-sm text-muted-foreground mb-2">
                    {t('playingFor', {duration})}
                    {timeUntilEnd && <> • {timeUntilEnd}</>}
                    {timeUntilEndEstimate && <> • {timeUntilEndEstimate}</>}
                    {currentMatch.extend_count > 0 && <> • {t('extendCount', {count: currentMatch.extend_count})}</>}
                </p>

                <div className="flex gap-2 mt-2 mb-4">
                    {hasScores ? (
                        <Tooltip>
                            <TooltipTrigger>
                                <Badge variant="default" className="cursor-help">
                                    {currentMatch.human_score}:{currentMatch.zombie_score}
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('scoreTooltip')}
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <Badge variant="outline">{t('noScoreData')}</Badge>
                    )}
                </div>

                <div className="flex flex-row gap-2 flex-wrap">
                    {[
                        [Info, t('mapInfo'), mapHref],
                        [Activity, t('matchInfo'), `${mapHref}/sessions/${currentMatch.time_id}`],
                    ].map(([Icon, label, href]: [LucideIcon, string, string]) => (
                        <Button key={label} variant="outline" size="sm" asChild>
                            <HoverPrefetchLink href={href}>
                                <Icon className="mr-2 h-4 w-4" />
                                {label}
                            </HoverPrefetchLink>
                        </Button>
                    ))}
                    <Button variant="default" size="sm" asChild>
                        <Link href={`/connect/${server.id}`}>
                            <Play className="mr-2 h-4 w-4" />
                            {t('join')}
                        </Link>
                    </Button>
                    {isSupported && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNotificationClick}
                            disabled={busy !== null || pushLoading}
                        >
                            {isSubscribed ? <BellOff className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
                            {busy ? busyLabels[busy] : t(isSubscribed ? 'cancelNotification' : 'notifyMapChange')}
                        </Button>
                    )}
                </div>
            </MatchLayout>
            {loginDialog}
        </>
    );
}

function MatchServerLine({ server }: { server: Server }) {
    const gameMeta = server.game ? GAME_META[server.game] : undefined;
    return (
        <div className="flex items-center gap-2 mb-2 min-w-0 text-sm">
            <Avatar className="w-5 h-5 shrink-0">
                {server.community_icon && <AvatarImage src={server.community_icon} alt={server.community_name}/>}
                <AvatarFallback className="text-[9px]">
                    {getServerAvatarText(server.community_shorten_name || server.community_name)}
                </AvatarFallback>
            </Avatar>
            <HoverPrefetchLink
                href={`/servers/${server.gotoLink}`}
                className="font-medium truncate hover:text-primary transition-colors"
            >
                {server.community_shorten_name || server.community_name}
            </HoverPrefetchLink>
            <span className="text-muted-foreground truncate">· {server.name}</span>
            {gameMeta && (
                <Badge variant="outline" className={`h-5 px-1.5 text-[10px] shrink-0 ${gameMeta.className}`}>
                    {gameMeta.label}
                </Badge>
            )}
        </div>
    );
}
