'use client'
import {memo, ReactNode, useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Gavel, MapPin, Minus, Pencil, Plus} from "lucide-react";
import {color} from "chart.js/helpers";
import Image from "next/image";
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {PlayerAvatar} from "components/players/PlayerAvatar.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {useServerMap} from "components/ui/ServerProvider";
import {communityTag} from "components/users/ProfileContext";
import {cn} from "components/lib/utils";
import {formatFlagName, ICE_FILE_ENDPOINT} from "utils/generalUtils.ts";
import {loadMapImage} from "lib/batchLoader";
import {InfractionLiveEvent, LiveEvent, MapLiveEvent, PlayerLiveEvent} from "./liveEvents";
import {useNow} from "./useLiveEvents";

/** Streamed rows that mount this soon after arriving get a short highlight. */
const FRESH_MS = 2000;

const pad = (value: number) => String(value).padStart(2, '0');

function formatAge(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 5) return 'now';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export function formatDuration(ms: number): string {
    const minutes = Math.max(0, Math.round(ms / 60000));
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

function EventTime({ at }: { at: number }) {
    const now = useNow();
    const time = new Date(at);
    return (
        <div className="w-14 shrink-0 pt-0.5 font-mono sm:w-20">
            <p className="text-xs font-medium">{formatAge(Math.max(0, now - at))}</p>
            <p className="text-[11px] text-muted-foreground">
                {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
            </p>
        </div>
    );
}

function readableTextOn(background: string): string {
    const parsed = color(background);
    if (!parsed.valid) return '#0a0a0a';
    const {r, g, b} = parsed.rgb;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#0a0a0a' : '#fafafa';
}

function ServerChip({ serverId, communityColors }: { serverId: string | null, communityColors: Record<string, string> }) {
    const {serversMapped} = useServerMap();
    const server = serverId ? serversMapped.get(serverId) : undefined;
    if (!server) return null;

    const short = server.community_shorten_name?.trim();
    const tag = short && short.length <= 8 ? short.toUpperCase() : communityTag(server.community_name, short);
    const background = communityColors[server.community_id] ?? '#888888';

    return (
        <HoverPrefetchLink
            href={`/servers/${server.gotoLink}`}
            className="inline-flex max-w-full min-w-0 shrink-0 items-center gap-2 self-start rounded-full border border-border py-0.5 pl-0.5 pr-3 text-xs text-muted-foreground transition-colors hover:text-foreground md:max-w-[260px]"
        >
            <span
                className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold tracking-wide"
                style={{backgroundColor: background, color: readableTextOn(background)}}
            >
                {tag}
            </span>
            <span className="truncate" title={server.name}>{server.name}</span>
        </HoverPrefetchLink>
    );
}

function useServerSlug(serverId: string | null): string | null {
    const {serversMapped} = useServerMap();
    if (!serverId) return null;
    return serversMapped.get(serverId)?.gotoLink ?? serverId;
}

function MaybeLink({ href, className, children }: { href: string | null, className?: string, children: ReactNode }) {
    return href
        ? <HoverPrefetchLink href={href} className={cn("hover:underline", className)}>{children}</HoverPrefetchLink>
        : <span className={className}>{children}</span>;
}

const PLAYER_ACTIONS = {
    join: { icon: Plus, badge: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    leave: { icon: Minus, badge: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
    name: { icon: Pencil, badge: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' },
} as const;

function PlayerContent({ event }: { event: PlayerLiveEvent }) {
    const t = useTranslations('tracker');
    const slug = useServerSlug(event.serverId);
    const action = PLAYER_ACTIONS[event.action] ?? PLAYER_ACTIONS.name;
    const Icon = action.icon;
    const label = event.action === 'join' ? t('joined')
        : event.action === 'leave' ? t('left')
        : event.action === 'name' ? t('renamed')
        : event.action;

    return (
        <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
                <PlayerAvatar uuid={event.playerId} name={event.name} serverId={event.serverId} width={36} height={36}/>
                <span className={cn("absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full ring-2 ring-background", action.badge)}>
                    <Icon className="size-2.5 text-black" strokeWidth={3.5}/>
                </span>
            </div>
            <div className="min-w-0">
                <p className="flex min-w-0 items-baseline gap-2">
                    <MaybeLink href={slug && `/servers/${slug}/players/${event.playerId}`} className="truncate font-semibold">
                        {event.name}
                    </MaybeLink>
                    <span className={cn("shrink-0 text-sm", action.text)}>{label}</span>
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{event.playerId}</p>
            </div>
        </div>
    );
}

function MapThumb({ serverId, map }: { serverId: string | null, map: string }) {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        if (!serverId) return;
        let active = true;
        loadMapImage(map, serverId).then(image => {
            if (active) setSrc(image?.small ?? null);
        });
        return () => { active = false; };
    }, [serverId, map]);

    return (
        <div className="relative h-[60px] w-[106px] shrink-0 overflow-hidden rounded-md border border-border bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)]">
            {src && <Image unoptimized src={src} alt={map} fill sizes="106px" className="object-cover" onError={() => setSrc(null)}/>}
        </div>
    );
}

function MapContent({ event }: { event: MapLiveEvent }) {
    const t = useTranslations('tracker');
    const slug = useServerSlug(event.serverId);
    const ended = event.endedAt !== null;

    return (
        <div className="flex min-w-0 items-center gap-4">
            <MapThumb serverId={event.serverId} map={event.map}/>
            <div className="min-w-0">
                <MaybeLink href={slug && `/servers/${slug}/maps/${event.map}`} className="flex min-w-0 items-center gap-2 font-mono font-medium">
                    <MapPin className="size-4 shrink-0 text-pink-600 dark:text-pink-400"/>
                    <span className="truncate">{event.map}</span>
                </MaybeLink>
                <p className="mt-1 text-sm text-muted-foreground">
                    {ended
                        ? t('endedAfter', {duration: formatDuration(event.endedAt - event.startedAt)})
                        : <span className="text-pink-600 dark:text-pink-400">{t('nowPlaying')}</span>}
                    <span className="mx-1.5">·</span>
                    {t('playerCount', {count: event.playerCount})}
                </p>
            </div>
        </div>
    );
}

function AdminAvatar({ name, avatarId }: { name: string, avatarId: string | null }) {
    return (
        <Avatar className="size-5">
            {avatarId && <AvatarImage src={ICE_FILE_ENDPOINT.replace('{}', avatarId)} alt={name}/>}
            <AvatarFallback className="bg-amber-700 text-[10px] font-semibold text-white">
                {[...name][0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
        </Avatar>
    );
}

const FlagBadge = ({ children, muted }: { children: ReactNode, muted?: boolean }) => (
    <span className={cn(
        "rounded border px-1.5 py-px text-[11px] font-medium",
        muted ? "border-border text-muted-foreground" : "border-amber-500/50 text-amber-600 dark:text-amber-400",
    )}>
        {children}
    </span>
);

function InfractionContent({ event }: { event: InfractionLiveEvent }) {
    const t = useTranslations('tracker');
    const slug = useServerSlug(event.serverId);
    const admin = event.adminName ?? t('system');
    const player = event.playerName ?? event.playerId ?? t('unknown');
    const playerHref = slug && event.playerId ? `/servers/${slug}/players/${event.playerId}` : null;

    return (
        <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <Gavel className="size-3.5"/>
                </span>
                <span className="font-semibold">{event.isNew ? t('newInfraction') : t('updatedInfraction')}</span>
                {event.punishment !== 'restrict' && <FlagBadge>{t(`punishment.${event.punishment}`)}</FlagBadge>}
                {event.extraFlags.map(flag => <FlagBadge key={flag}>{formatFlagName(flag)}</FlagBadge>)}
                {event.removed && <FlagBadge muted>{t('removed')}</FlagBadge>}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                    <AdminAvatar name={admin} avatarId={event.adminAvatarId}/>
                    <span className="truncate font-medium">{admin}</span>
                </span>
                <span className="text-muted-foreground">
                    {event.removed ? t('verb.removed') : t(`verb.${event.punishment}`)}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                    {event.playerId && (
                        <PlayerAvatar uuid={event.playerId} name={player} serverId={event.serverId} width={20} height={20} className="size-5 text-[10px]"/>
                    )}
                    <MaybeLink href={playerHref} className="truncate font-medium">{player}</MaybeLink>
                </span>
                {event.playerId && event.playerName && (
                    <span className="font-mono text-[11px] text-muted-foreground">{event.playerId}</span>
                )}
            </div>
            {event.reason && (
                <div className="flex items-baseline gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {t('reason')}
                    </span>
                    <span className="min-w-0 break-words">{event.reason}</span>
                </div>
            )}
        </div>
    );
}

function EventContent({ event }: { event: LiveEvent }) {
    switch (event.kind) {
        case 'player': return <PlayerContent event={event}/>;
        case 'map': return <MapContent event={event}/>;
        case 'infraction': return <InfractionContent event={event}/>;
    }
}

function LiveEventRowView({ event, communityColors }: { event: LiveEvent, communityColors: Record<string, string> }) {
    const [fresh] = useState(() => event.arrivedAt !== null && Date.now() - event.arrivedAt < FRESH_MS);

    return (
        <div className={cn("flex gap-3 px-4 py-3.5 sm:gap-4 sm:px-5", fresh && "live-row-fresh")}>
            <EventTime at={event.at}/>
            <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
                <div className="min-w-0 flex-1">
                    <EventContent event={event}/>
                </div>
                <ServerChip serverId={event.serverId} communityColors={communityColors}/>
            </div>
        </div>
    );
}

export const LiveEventRow = memo(LiveEventRowView);
