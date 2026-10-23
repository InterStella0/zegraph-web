'use client'
import {useState, useEffect, ReactNode} from 'react';
import { Card, CardContent } from 'components/ui/card';
import { Badge } from 'components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from 'components/ui/tabs';
import { Alert, AlertDescription } from 'components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from 'components/ui/avatar';
import {UserPlus, UserMinus, MapPin, Gavel, Gamepad2, Zap, Info, Loader2} from 'lucide-react';
import { cn } from "components/lib/utils";
import {formatFlagName, getMapImage, ICE_FILE_ENDPOINT, InfractionInt, URI} from "utils/generalUtils.ts";
import { PlayerAvatar } from "components/players/PlayerAvatar.tsx";
import { useServerMap } from "components/ui/ServerProvider";
import dayjs from "lib/dayjs";
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {AdSpot} from "components/ui/AdSpot";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from 'next-intl';

const MAX_EVENTS = 200;

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

function eventKey(event, index: number) {
    try {
        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        const timestamp = payload.timestamp || payload.created_at || Date.now();
        return `${event.channel}-${payload.player_id || payload.map_name || index}-${timestamp}`;
    } catch {
        return `${event.channel}-${index}-${Date.now()}`;
    }
}

/** Location pings are noise in the feed. */
function isLocationEvent(event) {
    if (event.channel !== 'player_activity') return false;
    try {
        return ['geolocate', 'location'].includes(JSON.parse(event.payload).event_name);
    } catch (e) {
        console.error("Malformed payload:", e);
        return false;
    }
}

export default function LiveServerTrackerPage(){
    const t = useTranslations('tracker');
    const [events, setEvents] = useState([]);
    const [selectedTab, setSelectedTab] = useState<string>('all');
    const [isConnected, setIsConnected] = useState(true);
    const [counters, setCounters] = useState({all: 0, playerActivity: 0, mapActivity: 0, infraction: 0});

    useEffect(() => {
        let attempt = 0;
        let retryTimer = null;
        let eventSource: EventSource = null;

        const connectEventSource = () => {
            eventSource = new EventSource(URI('/events/data-updates'));
            eventSource.onopen = () => {
                attempt = 0;
                setIsConnected(true);
            };
            eventSource.onmessage = (message) => {
                const newEvent = JSON.parse(message.data);
                if (newEvent.channel === "heartbeat" || isLocationEvent(newEvent)) return;

                const category = CHANNEL_CATEGORY[newEvent.channel];
                setEvents(prevEvents => [newEvent, ...prevEvents].slice(0, MAX_EVENTS));
                setCounters(prev => ({...prev, all: prev.all + 1, ...(category && {[category]: prev[category] + 1})}));
            };
            eventSource.onerror = (error) => {
                console.error('Error with SSE connection:', error);
                setIsConnected(false);
                eventSource.close();

                const delay = Math.min(5000 * 2 ** attempt, 60000) + Math.random() * 1000;
                attempt += 1;
                retryTimer = setTimeout(connectEventSource, delay);
            };
        };
        connectEventSource();
        return () => {
            clearTimeout(retryTimer);
            eventSource?.close();
        };
    }, []);

    const filteredEvents = selectedTab === 'all'
        ? events
        : events.filter(event => CHANNEL_CATEGORY[event.channel] === selectedTab);

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

                <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-3">
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

                <div className="max-h-[68vh] overflow-y-auto px-1 pb-2 scrollbar-modern">
                    {filteredEvents.length === 0 ? (
                        <Alert className="mt-2 border border-border">
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                {t('noEvents')}
                            </AlertDescription>
                        </Alert>
                    ) : filteredEvents.map((event, index) => {
                        const EventView = EVENT_VIEWS[CHANNEL_CATEGORY[event.channel]] ?? UnknownEvent;
                        return (
                            <div key={eventKey(event, index)} className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
                                <ErrorCatch message={t('eventRenderError')}>
                                    <EventView event={event} />
                                </ErrorCatch>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    )
}
