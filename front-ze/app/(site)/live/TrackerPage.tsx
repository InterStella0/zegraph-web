'use client'
import {useState, useEffect, useRef, useMemo} from 'react';
import { Card, CardContent } from 'components/ui/card';
import { Badge } from 'components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from 'components/ui/tabs';
import { Alert, AlertDescription } from 'components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from 'components/ui/avatar';
import {
    UserPlus,
    UserMinus,
    MapPin,
    Gavel,
    Gamepad2,
    Zap,
    Info,
    Loader2
} from 'lucide-react';
import { cn } from "components/lib/utils";
import {fetchUrl, formatFlagName, getMapImage, ICE_FILE_ENDPOINT, InfractionInt, URI} from "utils/generalUtils.ts";
import { PlayerAvatar } from "components/players/PlayerAvatar.tsx";
import { useServerMap } from "components/ui/ServerProvider";
import dayjs from "dayjs";
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {AdSpot} from "components/ui/AdSpot";
import Image from "next/image";
import Link from "next/link";
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from "dayjs/plugin/timezone";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import { useTranslations } from 'next-intl';

dayjs.extend(relativeTime)
dayjs.extend(timezone)
dayjs.extend(LocalizedFormat)

function ServerBadge({ serverId }: { serverId: string }) {
    const serverMap = useServerMap();
    const server = serverMap?.serversMapped.get(String(serverId));
    if (!server) return null;
    const label = server.community_shorten_name
        ? `${server.community_shorten_name} · ${server.name}`
        : server.name;
    return (
        <Badge variant="outline" className="ml-auto text-xs shrink-0">
            {label}
        </Badge>
    );
}

const InfractionView = ({event}) => {
    const t = useTranslations('tracker');
    const rowData = JSON.parse(event.payload)
    const payload = rowData.payload
    const admin = payload.admin;
    const adminId = admin.admin_id
    const player = payload.player
    const playerId = player?.gs_id
    const serverId = payload?.server_id
    const flags = new InfractionInt(payload.flags);
    try {
        const eventId = `${rowData.id || event.channel}-${player.gs_id}-${payload.timestamp || payload.created_at || Date.now()}`;

        return (
            <Card className="relative mb-2 rounded-lg transition-transform shadow-md text-left">
                <div className="absolute top-0 left-0 h-1 w-full bg-destructive rounded-t-lg" />
                <CardContent className="pt-2">
                    <div className="flex items-center mb-1.5">
                        <Avatar className="mr-1.5">
                            <AvatarFallback className="bg-destructive">
                                <Gavel className="h-4 w-4 text-white" />
                            </AvatarFallback>
                        </Avatar>
                        <h3 className="text-base font-bold">
                            {event.channel === 'infraction_new'? t('newInfraction'): t('updateInfraction')}
                        </h3>
                        {flags.getAllRestrictedFlags().map((v, i) => <Badge key={i}
                                                                           variant="destructive"
                                                                           className="ml-1"
                        >{formatFlagName(v)}</Badge>)}
                        <ServerBadge serverId={serverId} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="col-span-1">
                            <div className="flex items-center mb-1">
                                <div className="mr-1">
                                    <PlayerAvatar
                                        uuid={playerId}
                                        name={player.gs_name}
                                        serverId={serverId}
                                        sx={{ width: 32, height: 32 }}
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">
                                        {player?.gs_name ?? t('unknown') }
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        ID: {playerId ?? t('unknown')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="col-span-1">
                            <div className="flex items-center mb-1">
                                <div key={`admin-avatar-${adminId}-${eventId}`} className="mr-1">
                                    <Avatar>
                                        <AvatarImage
                                            src={ICE_FILE_ENDPOINT.replace('{}', admin.avatar_id)}
                                            alt={admin.admin_name}
                                        />
                                        <AvatarFallback>{admin.admin_name[0]}</AvatarFallback>
                                    </Avatar>
                                </div>
                                <div>
                                    <p className="text-sm font-medium">
                                        {admin.admin_name}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="col-span-full">
                            <div className="bg-muted/50 p-1.5 rounded-lg border border-border">
                                {payload.reason && (
                                    <p className="text-sm mt-1">
                                        {t('reason')} <strong>{payload.reason}</strong>
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground block mt-1">
                                    {dayjs(payload.created_at).format('lll')}
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    } catch (error) {
        console.error('Error rendering infraction event:', error, event);
        return (
            <Card className="mb-2 rounded-lg">
                <div className="h-1 w-full bg-chart-5" />
                <CardContent>
                    <p className="text-destructive">{t('infractionRenderError')}</p>
                </CardContent>
            </Card>
        );
    }
};

const MapActivity = ({event}) => {
    const t = useTranslations('tracker');
    const changeType = event.channel
    const payload = useMemo(() => JSON.parse(event.payload), [event])
    const [mapImage, setImage] = useState<string | null>()
    const server_id = payload.server_id
    useEffect(() => {
        getMapImage(server_id, payload.map).then(e => setImage(e? e.medium: null))
    }, [server_id, payload])
    try {
        return (
            <Card
                className="relative mb-2 rounded-lg transition-transform shadow-md"
            >
                <div className="absolute top-0 left-0 h-1 w-full bg-primary rounded-t-lg" />
                <CardContent className="pt-2">
                    <div className="flex items-center mb-1.5">
                        <h3 className="text-base font-bold">
                            {changeType === "map_changed"? t('mapChange'): t('mapUpdate')}
                        </h3>
                        <ServerBadge serverId={server_id} />
                    </div>
                    <div className={cn("grid gap-2 items-center", mapImage ? "grid-cols-1 sm:grid-cols-12" : "grid-cols-1")}>
                        {mapImage && (
                            <div className="col-span-1 sm:col-span-4 md:col-span-3">
                                <Image
                                    unoptimized
                                    src={mapImage}
                                    alt={payload.map}
                                    width={200}
                                    height={100}
                                    className="w-full h-auto rounded-lg border border-border"
                                />
                            </div>
                        )}
                        <div className={cn("col-span-1 text-left", mapImage ? "sm:col-span-8 md:col-span-9" : "")}>
                            <p className="text-sm">
                                <Link href={`/servers/${server_id}/maps/${payload.map}`}>
                                    <strong>{payload.map}</strong>
                                </Link>
                            </p>
                            <p className="text-sm">{t('playerCount', {count: payload.player_count})}</p>
                            {changeType === "map_update" &&
                                <p className="text-sm">{t('lasted', {minutes: dayjs(payload.ended_at).diff(dayjs(payload.started_at), 'minute')})}</p>}
                            <p className="text-xs text-muted-foreground block mt-1">
                                {dayjs(payload.started_at).format('lll')}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    } catch (error) {
        console.error('Error rendering map activity event:', error, event);
        return (
            <Card className="mb-2 rounded-lg">
                <div className="h-1 w-full bg-chart-5" />
                <CardContent>
                    <p className="text-destructive">{t('mapRenderError')}</p>
                </CardContent>
            </Card>
        );
    }
};

function PlayerActivity({event}){
    const t = useTranslations('tracker');
    const payload = JSON.parse(event.payload);
    const serverId = payload.server_id;
    const isJoin = payload.event_name === 'join';
    const eventId = `${event.id || event.channel}-${payload.player_id}-${payload.timestamp || payload.created_at || Date.now()}`;

    return (
        <Card
            className="relative mb-2 rounded-lg transition-transform shadow-md"
        >
            <div className={cn("absolute top-0 left-0 h-1 w-full rounded-t-lg", isJoin ? "bg-emerald-500" : "bg-destructive")} />
            <CardContent className="pt-2">
                <div className="flex items-center mb-1">
                    <div key={`avatar-${payload.player_id}-${eventId}`} className="mr-1.5">
                        <PlayerAvatar
                            uuid={payload.player_id}
                            name={payload.event_value}
                            serverId={serverId}
                            sx={{ width: 40, height: 40 }}
                        />
                    </div>
                    <div>
                        <p className="text-base font-bold">
                            <Link href={`/servers/${serverId}/players/${payload.player_id}`}>
                                {payload.event_value}
                            </Link>
                        </p>
                        <p className="text-xs text-muted-foreground">
                            ID: {payload.player_id}
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        <ServerBadge serverId={serverId} />
                        <Badge
                            variant={isJoin ? "default" : "destructive"}
                            className={cn(isJoin && "bg-emerald-500 hover:bg-emerald-600")}
                        >
                            {isJoin ? <UserPlus className="h-3 w-3 mr-1" /> : <UserMinus className="h-3 w-3 mr-1" />}
                            {isJoin ? t('joined') : t('left')}
                        </Badge>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground block mt-1">
                    {dayjs(payload.created_at).format("lll")}
                </p>
            </CardContent>
        </Card>
    );
}

const MAX_EVENTS = 2000;
const RENDER_STEP = 100;

// The same row always arrives as the same channel + payload, from the stream and the history alike.
const eventKey = (event) => `${event.channel}\u0000${event.payload}`;

const dedupeEvents = (events) => {
    const seen = new Set();
    return events.filter(event => {
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, MAX_EVENTS);
};

export default function LiveServerTrackerPage(){
    const t = useTranslations('tracker');
    const [events, setEvents] = useState([]);
    const [selectedTab, setSelectedTab] = useState(0);
    const [isConnected, setIsConnected] = useState(true);
    const [renderCount, setRenderCount] = useState(RENDER_STEP);
    const eventSourceRef = useRef(null);
    const loadMoreRef = useRef(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        let attempt = 0;
        let retryTimer = null;
        let cancelled = false;

        const connectEventSource = () => {
            const eventSource = new EventSource(URI('/events/data-updates'));
            eventSourceRef.current = eventSource;
            // Events from this connection are newer than any history fetched after it opened.
            let receivedSinceOpen = 0;

            eventSource.onopen = () => {
                attempt = 0;
                setIsConnected(true);
                // Fetched on every open, so a reconnect also fills whatever was missed while down.
                fetchUrl('/events/history')
                    .then((history) => {
                        if (cancelled || eventSourceRef.current !== eventSource) return;
                        setEvents(prev => dedupeEvents([
                            ...prev.slice(0, receivedSinceOpen),
                            ...history,
                            ...prev.slice(receivedSinceOpen),
                        ]));
                    })
                    .catch(e => console.error('Failed to load live event history:', e));
            };

            eventSource.onmessage = (event) => {
                const newEvent = JSON.parse(event.data);

                if (newEvent.channel === "heartbeat") {
                    return;
                }

                receivedSinceOpen += 1;
                setEvents(prevEvents => dedupeEvents([newEvent, ...prevEvents]));
            };

            eventSource.onerror = (error) => {
                console.error('Error with SSE connection:', error);
                setIsConnected(false);
                eventSource.close();

                const delay = Math.min(5000 * 2 ** attempt, 60000) + Math.random() * 1000;
                attempt += 1;
                retryTimer = setTimeout(connectEventSource, delay);
            };

            return eventSource;
        };
        connectEventSource();
        return () => {
            cancelled = true;
            if (retryTimer) {
                clearTimeout(retryTimer);
            }
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    const counters = useMemo(() => {
        const counted = { all: events.length, playerActivity: 0, mapActivity: 0, infraction: 0 };
        for (const event of events) {
            if (event.channel === 'player_activity') {
                counted.playerActivity += 1;
            } else if (['map_changed', 'map_update'].includes(event.channel)) {
                counted.mapActivity += 1;
            } else if (['infraction_update', 'infraction_new'].includes(event.channel)) {
                counted.infraction += 1;
            }
        }
        return counted;
    }, [events]);

    const filteredEvents = events.filter(event => {
        if (selectedTab === 0) return true;
        if (selectedTab === 1) return event.channel === 'player_activity';
        if (selectedTab === 2) return ['map_changed', 'map_update'].includes(event.channel);
        if (selectedTab === 3) return ['infraction_new', 'infraction_update'].includes(event.channel);
        return true;
    });
    const hasMoreToRender = filteredEvents.length > renderCount;

    useEffect(() => {
        setRenderCount(RENDER_STEP);
    }, [selectedTab]);

    // Up to 2000 cards each fetch images, so they mount a page at a time as the list scrolls.
    useEffect(() => {
        const sentinel = loadMoreRef.current;
        if (!sentinel || !hasMoreToRender) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setRenderCount(count => count + RENDER_STEP);
            }
        }, { root: scrollRef.current, rootMargin: '400px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMoreToRender, renderCount]);

    const renderEvent = (event) => {
        switch (event.channel) {
            case 'player_activity':
                return <PlayerActivity event={event} />;
            case 'map_update':
            case 'map_changed':
                return <MapActivity event={event} />
            case 'infraction_update':
            case 'infraction_new':
                return <InfractionView event={event} />;
            default:
                return (
                    <Card className="mb-2 rounded-lg">
                        <div className="h-1 w-full bg-muted" />
                        <CardContent>
                            <div>
                                <p className="font-medium">{event.channel}</p>
                                <p className="text-sm text-muted-foreground">{JSON.stringify(event.payload)}</p>
                            </div>
                        </CardContent>
                    </Card>
                );
        }
    };

    return (
        <div className="min-h-screen py-2 sm:py-4">
            <div className="max-w-[1200px] mx-auto p-1 sm:p-2">
                <div className="flex justify-between items-center mb-3">
                    <h1 className="text-2xl font-bold flex items-center">
                        <Gamepad2 className="mr-1 text-primary" />
                        {t('liveFeed')}
                        {!isConnected && (
                            <Tooltip>
                                <TooltipTrigger>
                                    <Loader2 className="ml-1 h-4 w-4 animate-spin text-chart-5" />
                                </TooltipTrigger>
                                <TooltipContent>{t('reconnecting')}</TooltipContent>
                            </Tooltip>
                        )}
                    </h1>

                    <div className="flex gap-1">
                        <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 font-bold">
                            <UserPlus className="h-3 w-3 mr-1" />
                            {counters.playerActivity}
                        </Badge>
                        <Badge className="bg-primary text-white hover:bg-primary/90 font-bold">
                            <MapPin className="h-3 w-3 mr-1" />
                            {counters.mapActivity}
                        </Badge>
                        <Badge className="bg-destructive text-white hover:bg-destructive/90 font-bold">
                            <Gavel className="h-3 w-3 mr-1" />
                            {counters.infraction}
                        </Badge>
                    </div>
                </div>

                <Tabs
                    value={selectedTab.toString()}
                    onValueChange={(v) => setSelectedTab(Number(v))}
                    className="mb-3"
                >
                    <TabsList className="bg-muted/80 p-1 rounded-lg w-full overflow-x-auto">
                        <TabsTrigger value="0" className="flex items-center gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:font-bold">
                            <Badge variant="outline" className="h-5 min-w-[20px]">
                                {counters.all}
                            </Badge>
                            <Zap className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('allEvents')}</span>
                        </TabsTrigger>
                        <TabsTrigger value="1" className="flex items-center gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:font-bold">
                            <Badge variant="outline" className="h-5 min-w-[20px]">
                                {counters.playerActivity}
                            </Badge>
                            <UserPlus className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('playerActivity')}</span>
                        </TabsTrigger>
                        <TabsTrigger value="2" className="flex items-center gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:font-bold">
                            <Badge variant="outline" className="h-5 min-w-[20px]">
                                {counters.mapActivity}
                            </Badge>
                            <MapPin className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('mapChanges')}</span>
                        </TabsTrigger>
                        <TabsTrigger value="3" className="flex items-center gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:font-bold">
                            <Badge variant="outline" className="h-5 min-w-[20px]">
                                {counters.infraction}
                            </Badge>
                            <Gavel className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('infractions')}</span>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <AdSpot className="mb-3" />

                <div ref={scrollRef} className="max-h-[68vh] overflow-y-auto px-1 pb-2 scrollbar-modern">
                    {filteredEvents.length === 0 ? (
                        <Alert className="mt-2 border border-border">
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                {t('noEvents')}
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div>
                            {filteredEvents.slice(0, renderCount).map((event) => (
                                <div
                                    key={eventKey(event)}
                                    className="animate-in fade-in-0 slide-in-from-top-2 duration-300"
                                >
                                    <ErrorCatch message={t('eventRenderError')}>
                                        {renderEvent(event)}
                                    </ErrorCatch>
                                </div>
                            ))}
                            {hasMoreToRender && (
                                <div ref={loadMoreRef} className="flex justify-center py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}