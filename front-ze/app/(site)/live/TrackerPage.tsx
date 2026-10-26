'use client'
import {useState, useEffect, useMemo, useRef, ReactNode} from 'react';
import { Card, CardContent } from 'components/ui/card';
import { Badge } from 'components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from 'components/ui/tabs';
import { Alert, AlertDescription } from 'components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from 'components/ui/avatar';
import {UserPlus, UserMinus, MapPin, Gavel, Gamepad2, Zap, Info, Loader2} from 'lucide-react';
import { cn } from "components/lib/utils";
import {fetchUrl, formatFlagName, getMapImage, ICE_FILE_ENDPOINT, InfractionInt, URI} from "utils/generalUtils.ts";
import { PlayerAvatar } from "components/players/PlayerAvatar.tsx";
import { useServerMap } from "components/ui/ServerProvider";
import dayjs from "lib/dayjs";
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {AdSpot} from "components/ui/AdSpot";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from 'next-intl';

const MAX_EVENTS = 2000;
const RENDER_STEP = 100;

type Category = 'playerActivity' | 'mapActivity' | 'infraction';

const CHANNEL_CATEGORY: Record<string, Category> = {
    player_activity: 'playerActivity',
    map_changed: 'mapActivity',
    map_update: 'mapActivity',
    infraction_new: 'infraction',
    infraction_update: 'infraction',
};

const CATEGORIES = [
    {key: 'playerActivity', label: 'playerActivity', icon: UserPlus, badge: 'bg-emerald-500 text-white hover:bg-emerald-600'},
    {key: 'mapActivity', label: 'mapChanges', icon: MapPin, badge: 'bg-primary text-white hover:bg-primary/90'},
    {key: 'infraction', label: 'infractions', icon: Gavel, badge: 'bg-destructive text-white hover:bg-destructive/90'},
] as const;

const TABS = [{key: 'all', label: 'allEvents', icon: Zap}, ...CATEGORIES] as const;

/** Event card with a coloured strip along its top edge. */
function EventCard({accent, className, children}: {accent: string, className?: string, children: ReactNode}) {
    return (
        <Card className={cn("relative mb-2 rounded-lg transition-transform shadow-md", className)}>
            <div className={cn("absolute top-0 left-0 h-1 w-full rounded-t-lg", accent)} />
            <CardContent className="pt-2">{children}</CardContent>
        </Card>
    );
}

function PlainEventCard({accent, children}: {accent: string, children: ReactNode}) {
    return (
        <Card className="mb-2 rounded-lg">
            <div className={cn("h-1 w-full", accent)} />
            <CardContent>{children}</CardContent>
        </Card>
    );
}

function RenderErrorCard({message}: {message: string}) {
    return (
        <PlainEventCard accent="bg-chart-5">
            <p className="text-destructive">{message}</p>
        </PlainEventCard>
    );
}

function EventTime({at}: {at: string}) {
    return <p className="text-xs text-muted-foreground block mt-1">{dayjs(at).format('lll')}</p>;
}

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

function PersonRow({avatar, name, children}: {avatar: ReactNode, name: ReactNode, children?: ReactNode}) {
    return (
        <div className="col-span-1">
            <div className="flex items-center mb-1">
                <div className="mr-1">{avatar}</div>
                <div>
                    <p className="text-sm font-medium">{name}</p>
                    {children}
                </div>
            </div>
        </div>
    );
}

function InfractionView({event}) {
    const t = useTranslations('tracker');
    const payload = JSON.parse(event.payload).payload
    const admin = payload.admin;
    const player = payload.player
    const playerId = player?.gs_id
    const serverId = payload?.server_id
    const flags = new InfractionInt(payload.flags);
    try {
        return (
            <EventCard accent="bg-destructive" className="text-left">
                <div className="flex items-center mb-1.5">
                    <Avatar className="mr-1.5">
                        <AvatarFallback className="bg-destructive">
                            <Gavel className="h-4 w-4 text-white" />
                        </AvatarFallback>
                    </Avatar>
                    <h3 className="text-base font-bold">
                        {event.channel === 'infraction_new' ? t('newInfraction') : t('updateInfraction')}
                    </h3>
                    {flags.getAllRestrictedFlags().map((flag, i) => (
                        <Badge key={i} variant="destructive" className="ml-1">{formatFlagName(flag)}</Badge>
                    ))}
                    <ServerBadge serverId={serverId} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <PersonRow
                        name={player?.gs_name ?? t('unknown')}
                        avatar={<PlayerAvatar uuid={playerId} name={player.gs_name} serverId={serverId} sx={{ width: 32, height: 32 }} />}
                    >
                        <p className="text-xs text-muted-foreground">ID: {playerId ?? t('unknown')}</p>
                    </PersonRow>
                    <PersonRow
                        name={admin.admin_name}
                        avatar={
                            <Avatar>
                                <AvatarImage src={ICE_FILE_ENDPOINT.replace('{}', admin.avatar_id)} alt={admin.admin_name} />
                                <AvatarFallback>{admin.admin_name[0]}</AvatarFallback>
                            </Avatar>
                        }
                    />
                    <div className="col-span-full">
                        <div className="bg-muted/50 p-1.5 rounded-lg border border-border">
                            {payload.reason && (
                                <p className="text-sm mt-1">
                                    {t('reason')} <strong>{payload.reason}</strong>
                                </p>
                            )}
                            <EventTime at={payload.created_at} />
                        </div>
                    </div>
                </div>
            </EventCard>
        );
    } catch (error) {
        console.error('Error rendering infraction event:', error, event);
        return <RenderErrorCard message={t('infractionRenderError')} />;
    }
}

function MapActivity({event}) {
    const t = useTranslations('tracker');
    const payload = JSON.parse(event.payload)
    const serverId = payload.server_id
    const [mapImage, setImage] = useState<string | null>()
    useEffect(() => {
        getMapImage(serverId, payload.map).then(e => setImage(e ? e.medium : null))
    }, [serverId, payload.map])
    try {
        return (
            <EventCard accent="bg-primary">
                <div className="flex items-center mb-1.5">
                    <h3 className="text-base font-bold">
                        {event.channel === "map_changed" ? t('mapChange') : t('mapUpdate')}
                    </h3>
                    <ServerBadge serverId={serverId} />
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
                    <div className={cn("col-span-1 text-left", mapImage && "sm:col-span-8 md:col-span-9")}>
                        <p className="text-sm">
                            <Link href={`/servers/${serverId}/maps/${payload.map}`}>
                                <strong>{payload.map}</strong>
                            </Link>
                        </p>
                        <p className="text-sm">{t('playerCount', {count: payload.player_count})}</p>
                        {event.channel === "map_update" &&
                            <p className="text-sm">{t('lasted', {minutes: dayjs(payload.ended_at).diff(dayjs(payload.started_at), 'minute')})}</p>}
                        <EventTime at={payload.started_at} />
                    </div>
                </div>
            </EventCard>
        );
    } catch (error) {
        console.error('Error rendering map activity event:', error, event);
        return <RenderErrorCard message={t('mapRenderError')} />;
    }
}

function PlayerActivity({event}){
    const t = useTranslations('tracker');
    const payload = JSON.parse(event.payload);
    const serverId = payload.server_id;
    const isJoin = payload.event_name === 'join';
    const JoinIcon = isJoin ? UserPlus : UserMinus;

    return (
        <EventCard accent={isJoin ? "bg-emerald-500" : "bg-destructive"}>
            <div className="flex items-center mb-1">
                <div className="mr-1.5">
                    <PlayerAvatar uuid={payload.player_id} name={payload.event_value} serverId={serverId} sx={{ width: 40, height: 40 }} />
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
                        <JoinIcon className="h-3 w-3 mr-1" />
                        {isJoin ? t('joined') : t('left')}
                    </Badge>
                </div>
            </div>
            <EventTime at={payload.created_at} />
        </EventCard>
    );
}

function UnknownEvent({event}) {
    return (
        <PlainEventCard accent="bg-muted">
            <p className="font-medium">{event.channel}</p>
            <p className="text-sm text-muted-foreground">{JSON.stringify(event.payload)}</p>
        </PlainEventCard>
    );
}

const EVENT_VIEWS: Record<Category, typeof UnknownEvent> = {
    playerActivity: PlayerActivity,
    mapActivity: MapActivity,
    infraction: InfractionView,
};

// The same row always arrives as the same channel + payload, from the stream and the history alike.
const eventKey = (event) => `${event.channel}\u0000${event.payload}`;

// A Map keeps each key at its first position, so the order is unchanged.
const dedupeEvents = (events) => [...new Map(events.map(event => [eventKey(event), event])).values()].slice(0, MAX_EVENTS);

export default function LiveServerTrackerPage(){
    const t = useTranslations('tracker');
    const [events, setEvents] = useState([]);
    const [selectedTab, setSelectedTab] = useState<string>('all');
    const [isConnected, setIsConnected] = useState(true);
    const [renderCount, setRenderCount] = useState(RENDER_STEP);
    const loadMoreRef = useRef(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        let attempt = 0;
        let retryTimer = null;
        let eventSource: EventSource = null;

        const connectEventSource = () => {
            const source = eventSource = new EventSource(URI('/events/data-updates'));
            // Events from this connection are newer than any history fetched after it opened.
            let receivedSinceOpen = 0;
            source.onopen = () => {
                attempt = 0;
                setIsConnected(true);
                // Fetched on every open, so a reconnect also fills whatever was missed while down.
                fetchUrl('/events/history')
                    .then(history => {
                        // A newer connection, or unmounting, has taken over.
                        if (eventSource !== source) return;
                        setEvents(prev => dedupeEvents([...prev.slice(0, receivedSinceOpen), ...history, ...prev.slice(receivedSinceOpen)]));
                    })
                    .catch(e => console.error('Failed to load live event history:', e));
            };
            source.onmessage = (message) => {
                const newEvent = JSON.parse(message.data);
                if (newEvent.channel === "heartbeat") return;
                receivedSinceOpen += 1;
                setEvents(prevEvents => dedupeEvents([newEvent, ...prevEvents]));
            };
            source.onerror = (error) => {
                console.error('Error with SSE connection:', error);
                setIsConnected(false);
                source.close();

                const delay = Math.min(5000 * 2 ** attempt, 60000) + Math.random() * 1000;
                attempt += 1;
                retryTimer = setTimeout(connectEventSource, delay);
            };
        };
        connectEventSource();
        return () => {
            clearTimeout(retryTimer);
            eventSource?.close();
            eventSource = null;
        };
    }, []);

    const counters = useMemo(() => {
        const counted = {all: events.length, playerActivity: 0, mapActivity: 0, infraction: 0};
        for (const event of events) {
            const category = CHANNEL_CATEGORY[event.channel];
            if (category) counted[category] += 1;
        }
        return counted;
    }, [events]);

    const filteredEvents = selectedTab === 'all'
        ? events
        : events.filter(event => CHANNEL_CATEGORY[event.channel] === selectedTab);
    const hasMoreToRender = filteredEvents.length > renderCount;

    // Up to 2000 cards each fetch images, so they mount a page at a time as the list scrolls.
    useEffect(() => {
        const sentinel = loadMoreRef.current;
        if (!sentinel || !hasMoreToRender) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) setRenderCount(count => count + RENDER_STEP);
        }, {root: scrollRef.current, rootMargin: '400px'});
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMoreToRender, renderCount]);

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
                        {CATEGORIES.map(({key, icon: Icon, badge}) => (
                            <Badge key={key} className={`${badge} font-bold`}>
                                <Icon className="h-3 w-3 mr-1" />
                                {counters[key]}
                            </Badge>
                        ))}
                    </div>
                </div>

                <Tabs value={selectedTab} onValueChange={tab => { setSelectedTab(tab); setRenderCount(RENDER_STEP); }} className="mb-3">
                    <TabsList className="bg-muted/80 p-1 rounded-lg w-full overflow-x-auto">
                        {TABS.map(({key, label, icon: Icon}) => (
                            <TabsTrigger key={key} value={key} className="flex items-center gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:font-bold">
                                <Badge variant="outline" className="h-5 min-w-[20px]">
                                    {counters[key]}
                                </Badge>
                                <Icon className="h-4 w-4" />
                                <span className="hidden sm:inline">{t(label)}</span>
                            </TabsTrigger>
                        ))}
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
                        <>
                            {filteredEvents.slice(0, renderCount).map(event => {
                                const EventView = EVENT_VIEWS[CHANNEL_CATEGORY[event.channel]] ?? UnknownEvent;
                                return (
                                    <div key={eventKey(event)} className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
                                        <ErrorCatch message={t('eventRenderError')}>
                                            <EventView event={event} />
                                        </ErrorCatch>
                                    </div>
                                );
                            })}
                            {hasMoreToRender && (
                                <div ref={loadMoreRef} className="flex justify-center py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
