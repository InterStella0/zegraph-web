'use client'
import {use, useEffect, useState} from 'react'
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import {Info, Activity, Book, Bell, BellOff, Play} from 'lucide-react';
import {getMapImage, fetchApiUrl} from "utils/generalUtils";
import Link from "next/link";
import {getContinentStatsNow, getMatchNow} from "../../app/servers/[server_slug]/maps/util";
import { ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import Image from "next/image";
import { ServerMapMatch} from "types/maps.ts";
import {Server} from "types/community.ts";
import {ContinentStatistics} from "types/players.ts";
import PlayerContinentCounter from "components/players/PlayerContinentCounter.tsx";
import {Skeleton} from "components/ui/skeleton";
import {Badge} from "components/ui/badge";
import {Button} from "components/ui/button";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "components/ui/tooltip";
import {usePushNotifications} from "lib/hooks/usePushNotifications";
import {toast} from "sonner";
import {SteamProfile} from "../../next-auth-steam/steam.ts";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import LoginDialog from "components/ui/LoginDialog";
import {useTranslations} from "next-intl";

dayjs.extend(duration);

export function CurrentMatchLoading() {
    return (
        <div className="mb-6 border border-border rounded-lg bg-gradient-to-br from-primary/5 via-secondary/5 to-background p-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-4">
                    <Skeleton className="w-full h-40 rounded-lg" />
                </div>
                <div className="md:col-span-5">
                    <Skeleton className="h-3 w-32 mb-3" />
                    <Skeleton className="h-8 w-3/4 mb-3" />
                    <Skeleton className="h-4 w-1/2 mb-4" />
                    <Skeleton className="h-6 w-20 mb-4" />
                    <div className="flex flex-row gap-2 flex-wrap">
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-8 w-20" />
                    </div>
                </div>
                <div className="md:col-span-3">
                    <div className="flex flex-col gap-4 items-center">
                        <Skeleton className="h-12 w-16" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                </div>
            </div>
        </div>
    );
}

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

        const loadCurrentMatch = async () => {
            try {
                const matchData = await getMatchNow(server_id)
                setCurrentMatch(matchData);

                if (matchData?.map) {
                    const image = await getMapImage(server_id, matchData.map)
                    setMapImage(image?.large || null)
                }
            } catch (err) {
                console.error('Failed to load current match:', err)
                setCurrentMatch(null)
            }
        };

        const interval = setInterval(loadCurrentMatch, 65000);
        loadCurrentMatch()
        return () => clearInterval(interval);
    }, [server_id]);

    useEffect(() => {
        if (!server_id) return;
        const fetchContinentStats = async () => {
            try {
                const data = await getContinentStatsNow(server_id)
                setContinentData(data);
            } catch (err) {
                console.error('Error fetching continent stats:', err);
            }
        };

        fetchContinentStats();
        const interval = setInterval(fetchContinentStats, 65000);
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

function CurrentMatchDisplay({ server, mapImage, currentMatch, continentData, user }: {
    server: Server, mapImage: string | null, currentMatch: ServerMapMatch, continentData: ContinentStatistics, user: SteamProfile | null
}) {
    const t = useTranslations('servers.currentMatch');
    const [currentTime, setCurrentTime] = useState(dayjs());
    const { isSupported, subscription, subscribe, isLoading: pushLoading } = usePushNotifications(user != null);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [flowState, setFlowState] = useState<'idle' | 'enabling-push' | 'subscribing-map'>('idle');
    const [loginDialogOpen, setLoginDialogOpen] = useState(false);

    useEffect(() => {
        if (!user || !subscription) return;

        const checkSubscription = async () => {
            try {
                const subs: Array<{id: string; server_id: string; triggered: boolean}> = await fetchApiUrl('/accounts/me/push/map-change');
                const active = subs.find(s => s.server_id === server.id && !s.triggered);
                setIsSubscribed(!!active);
            } catch (error) {
                console.error('Failed to check map change subscription:', error);
            }
        };

        checkSubscription();
    }, [user, subscription, server.id]);

    const handleNotificationClick = async () => {
        if (!user) {
            setLoginDialogOpen(true);
            return;
        }

        if (isSubscribed) {
            return handleUnsubscribe();
        }

        let subscriptionToUse: { id: string; endpoint: string } | null = subscription;
        if (!subscription) {
            setFlowState('enabling-push');
            toast.info(t('requestingPermission'));

            subscriptionToUse = await subscribe();
            setFlowState('idle');

            if (!subscriptionToUse) {
                toast.error(t('enableNotificationsFailed'));
                return;
            }

            toast.success(t('notificationsEnabled'));
            // Continue to map subscription below
        }

        // Subscribe to map changes
        setFlowState('subscribing-map');
        setLoading(true);
        try {
            await fetchApiUrl('/accounts/me/push/map-change/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server_id: server.id,
                    subscription_id: subscriptionToUse.id,
                }),
            });

            setIsSubscribed(true);
            toast.success(t('willBeNotified'));
        } catch (error) {
            toast.error(t('subscribeFailed'));
            console.error('Subscribe error:', error);
        } finally {
            setLoading(false);
            setFlowState('idle');
        }
    };

    const handleUnsubscribe = async () => {
        setLoading(true);
        try {
            await fetchApiUrl(`/accounts/me/push/map-change/${server.id}`, {
                method: 'DELETE',
            });

            setIsSubscribed(false);
            toast.success(t('notificationCancelled'));
        } catch (error) {
            toast.error(t('unsubscribeFailed'));
            console.error('Unsubscribe error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(dayjs());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const formatTimeUntilEnd = (serverTimeEnd, prefix, onEnding=null) => {
        if (!serverTimeEnd) return null;

        const end = dayjs(serverTimeEnd);
        const diff = end.diff(currentTime);

        if (diff <= 0) return onEnding ?? t('ending');

        const dur = dayjs.duration(diff);
        const hours = Math.floor(dur.asHours());
        const minutes = dur.minutes();
        const seconds = dur.seconds();

        if (hours > 0) {
            return `${prefix} ${hours}h ${minutes}m ${seconds}s`;
        }
        if (minutes > 0) {
            return `${prefix} ${minutes}m ${seconds}s`;
        }
        return `${prefix} ${seconds}s`;
    };

    const formatMatchDuration = (startedAt) => {
        if (!startedAt) return t('unknown');

        const started = dayjs(startedAt);
        const diff = currentTime.diff(started);
        const dur = dayjs.duration(diff);

        const hours = Math.floor(dur.asHours());
        const minutes = dur.minutes();
        const seconds = dur.seconds();

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const duration = formatMatchDuration(currentMatch.started_at);
    const timeUntilEnd = currentMatch.server_time_end ? formatTimeUntilEnd(currentMatch.server_time_end, t('timeLeft'), t('lastRound')): null;
    const timeUntilEndEstimate = formatTimeUntilEnd(currentMatch.estimated_time_end, t('estimatedEndIn'), t('probablyEnding'));
    const hasScores = currentMatch.human_score !== null && currentMatch.zombie_score !== null;

    return (
        <>
            <TooltipProvider>
                <div
                    suppressHydrationWarning
                    className="mb-6 border border-border rounded-lg bg-gradient-to-br from-primary/5 via-secondary/5 to-background p-6"
                >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                        <div className="md:col-span-4">
                            <div className="rounded-lg overflow-hidden h-40">
                                {mapImage ? (
                                    <Image
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
                        </div>
                        <div className="md:col-span-5">
                            <span className="text-xs uppercase tracking-widest font-bold text-primary">
                                🎮 {t('currentlyPlaying')}
                            </span>

                            <h4 className="text-2xl md:text-4xl mb-2 font-bold overflow-hidden text-ellipsis whitespace-nowrap max-w-[40rem]">
                                {currentMatch.map}
                            </h4>

                            <p suppressHydrationWarning className="text-sm text-muted-foreground mb-2">
                                {t('playingFor', {duration})}
                                {timeUntilEnd && (
                                    <> • {timeUntilEnd}</>
                                )}
                                {timeUntilEndEstimate && (
                                    <> • {timeUntilEndEstimate}</>
                                )}
                                {(currentMatch.extend_count && currentMatch.extend_count > 0)?
                                    <> • {t('extendCount', {count: currentMatch.extend_count})}</>: null
                                }
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
                                <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                >
                                    <HoverPrefetchLink href={`/servers/${server.gotoLink}/maps/${currentMatch.map}`}>
                                        <Info className="mr-2 h-4 w-4" />
                                        {t('mapInfo')}
                                    </HoverPrefetchLink>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                >
                                    <HoverPrefetchLink href={`/servers/${server.gotoLink}/maps/${currentMatch.map}/sessions/${currentMatch.time_id}`}>
                                        <Activity className="mr-2 h-4 w-4" />
                                        {t('matchInfo')}
                                    </HoverPrefetchLink>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                >
                                    <Link href={`/servers/${server.gotoLink}/maps/${currentMatch.map}/guides/`}>
                                        <Book className="mr-2 h-4 w-4" />
                                        {t('guides')}
                                    </Link>
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    asChild
                                >
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
                                        disabled={loading || flowState !== 'idle' || pushLoading}
                                    >
                                        {isSubscribed ? <BellOff className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
                                        {(() => {
                                            if (flowState === 'enabling-push') return t('enablingNotifications');
                                            if (flowState === 'subscribing-map') return t('subscribing');
                                            if (loading) return t('loading');
                                            if (isSubscribed) return t('cancelNotification');
                                            return t('notifyMapChange');
                                        })()}
                                    </Button>
                                )}
                            </div>
                        </div>
                        <div className="md:col-span-3">
                            <div className="flex flex-col gap-4">
                                <div className="text-center">
                                    <h2 className="text-5xl font-bold text-primary">
                                        {currentMatch.player_count || '?'}
                                    </h2>
                                    <span className="text-xs text-muted-foreground font-medium">
                                        {t('playersUpper')}
                                    </span>
                                </div>

                                {continentData && continentData.total_count > 0 && <PlayerContinentCounter continentData={continentData} />}
                            </div>
                        </div>
                    </div>
                </div>
            </TooltipProvider>
            <LoginDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} />
        </>
    );
}
