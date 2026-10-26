'use client'
import {ReactNode} from 'react';
import dayjs from "lib/dayjs";
import {Ban, Clock} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {Badge} from "components/ui/badge";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {useServerMap} from "components/ui/ServerProvider";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import {GlobalMapPlayed, GlobalMapServer} from "types/maps.ts";
import {isBlocked, mapBlockers, readyAt} from "utils/mapCooldown";
import {useMapCooldownText} from "lib/hooks/useMapCooldownText";
import {Server} from "types/community.ts";

export const STATUS_TONE = {
    playing: 'text-primary',
    ready: 'text-green-500',
    waiting: 'text-amber-500',
    off: 'text-red-500',
} as const;

export type ServerState = { tone: keyof typeof STATUS_TONE, label: ReactNode };

const blockersOf = (server: GlobalMapServer) => mapBlockers(server.map_left, server.cooldown, server.nom_opens_at);

function isAvailable(server: GlobalMapServer): boolean {
    return server.enabled && !server.removed && !isBlocked(blockersOf(server));
}

function serverLabel(server: Server | undefined, fallback: string): string {
    return server?.community_shorten_name || server?.community_name || fallback;
}

export function useServerMapState(): (server: GlobalMapServer) => ServerState {
    const t = useTranslations('maps.table');
    const cooldownText = useMapCooldownText();
    return server => {
        if (server.is_playing) return {tone: 'playing', label: t('playing')};
        if (server.removed) return {tone: 'off', label: t('removed')};
        if (!server.enabled) return {tone: 'off', label: t('disabled')};
        const blockers = blockersOf(server);
        if (isBlocked(blockers))
            return {tone: 'waiting', label: <span suppressHydrationWarning>{cooldownText.label(blockers)}</span>};
        return {tone: 'ready', label: t('ready')};
    };
}

export default function GlobalMapStatusChip({ map }: { map: GlobalMapPlayed }) {
    const t = useTranslations('maps.table');
    const tGlobal = useTranslations('maps.global');
    const toDayjs = useLocalDayjs();
    const { serversMapped } = useServerMap();
    const stateOf = useServerMapState();

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
    const waiting = (content: ReactNode) => withBreakdown(
        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-500">
            <Clock className="h-3 w-3"/>
            {content}
        </Badge>
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

    const enabled = active.filter(server => server.enabled);
    const soonest = enabled
        .map(blockersOf)
        .filter(blockers => blockers.mapsLeft == null)
        .map(readyAt)
        .filter((time): time is string => time != null)
        .sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf())[0];
    if (soonest) return waiting(<span suppressHydrationWarning>{toDayjs(soonest).fromNow(true)}</span>);
    const mapsLeft = enabled
        .map(server => server.map_left ?? 0)
        .filter(left => left > 0);
    if (mapsLeft.length > 0) return waiting(t('mapsLeft', {count: Math.min(...mapsLeft)}));

    return withBreakdown(
        <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3"/>
            {active.length === 0 ? t('removed') : t('disabled')}
        </Badge>
    );
}
