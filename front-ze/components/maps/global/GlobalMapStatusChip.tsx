'use client'
import {ReactNode} from 'react';
import dayjs from 'dayjs';
import relativeTime from "dayjs/plugin/relativeTime";
import {Ban, Clock} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {Badge} from "components/ui/badge";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {useServerMap} from "components/ui/ServerProvider";
import {useLocalDayjs} from "lib/hooks/useHydrated";
import {GlobalMapPlayed, GlobalMapServer} from "types/maps.ts";
import {Server} from "types/community.ts";

dayjs.extend(relativeTime);

// The tooltip surface is inverted from the page, so mid tones that read on either theme.
const STATUS_TONE = {
    playing: 'text-primary',
    ready: 'text-green-500',
    waiting: 'text-amber-500',
    off: 'text-red-500',
} as const;

type ServerState = { tone: keyof typeof STATUS_TONE, label: ReactNode };

function hasCooldown(server: GlobalMapServer): boolean {
    return server.cooldown != null && dayjs(server.cooldown).isAfter(dayjs());
}

function isAvailable(server: GlobalMapServer): boolean {
    const noMapsLeft = server.map_left == null || server.map_left <= 0;
    return server.enabled && !server.removed && !hasCooldown(server) && noMapsLeft;
}

function serverLabel(server: Server | undefined, fallback: string): string {
    return server?.community_shorten_name || server?.community_name || fallback;
}

export default function GlobalMapStatusChip({ map }: { map: GlobalMapPlayed }) {
    const t = useTranslations('maps.table');
    const tGlobal = useTranslations('maps.global');
    const toDayjs = useLocalDayjs();
    const { serversMapped } = useServerMap();

    const stateOf = (server: GlobalMapServer): ServerState => {
        if (server.is_playing) return {tone: 'playing', label: t('playing')};
        if (server.removed) return {tone: 'off', label: t('removed')};
        if (!server.enabled) return {tone: 'off', label: t('disabled')};
        if (server.map_left != null && server.map_left > 0)
            return {tone: 'waiting', label: t('mapsLeft', {count: server.map_left})};
        if (hasCooldown(server))
            return {tone: 'waiting', label: <span suppressHydrationWarning>{toDayjs(server.cooldown).fromNow(true)}</span>};
        return {tone: 'ready', label: t('ready')};
    };

    const breakdown = (
        <ul className="space-y-0.5">
            {map.servers.map(server => {
                const known = serversMapped.get(server.server_id);
                const state = stateOf(server);
                return (
                    <li key={server.server_id} className="flex items-center justify-between gap-4">
                        <span>
                            <span className="font-medium">{serverLabel(known, server.server_id)}</span>
                            {known && <span className="opacity-70"> · {known.name}</span>}
                        </span>
                        <span className={`font-semibold whitespace-nowrap ${STATUS_TONE[state.tone]}`}>{state.label}</span>
                    </li>
                );
            })}
        </ul>
    );
    const withBreakdown = (chip: ReactNode) => (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-flex cursor-help">{chip}</span>
            </TooltipTrigger>
            <TooltipContent>{breakdown}</TooltipContent>
        </Tooltip>
    );

    const playing = map.servers.filter(server => server.is_playing);
    if (map.is_playing) return withBreakdown(
        <Badge variant="default">
            {playing.length === 1
                ? tGlobal('playingOn', {server: serverLabel(serversMapped.get(playing[0].server_id), playing[0].server_id)})
                : tGlobal('playingOnCount', {count: playing.length})}
        </Badge>
    );

    const active = map.servers.filter(server => !server.removed);
    const ready = active.filter(isAvailable).length;
    if (ready > 0) return withBreakdown(
        <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-500">
            {tGlobal('readyOn', {ready, total: active.length})}
        </Badge>
    );

    // Nothing is ready, so whatever is enabled is cooling down: by time, or by maps still to play.
    const enabled = active.filter(server => server.enabled);
    const soonest = enabled
        .filter(hasCooldown)
        .map(server => server.cooldown as string)
        .sort()[0];
    if (soonest) return withBreakdown(
        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-500">
            <Clock className="h-3 w-3"/>
            <span suppressHydrationWarning>{toDayjs(soonest).fromNow(true)}</span>
        </Badge>
    );
    const mapsLeft = enabled
        .map(server => server.map_left ?? 0)
        .filter(left => left > 0);
    if (mapsLeft.length > 0) return withBreakdown(
        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-500">
            <Clock className="h-3 w-3"/>
            {t('mapsLeft', {count: Math.min(...mapsLeft)})}
        </Badge>
    );

    return withBreakdown(
        <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3"/>
            {active.length === 0 ? t('removed') : t('disabled')}
        </Badge>
    );
}
