'use client'
import {useEffect, useState} from 'react';
import Image from "next/image";
import {useTranslations} from 'next-intl';
import {loadMapImage} from "lib/batchLoader";
import {ScrollArea} from "components/ui/scroll-area";
import {GAME_META} from "components/ui/ServerIndicator";
import {Server} from "types/community.ts";

function LiveServerRow({ server, active, onSelect }: {
    server: Server, active: boolean, onSelect: (serverId: string) => void,
}) {
    const [image, setImage] = useState<string | null>(null);
    const gameMeta = server.game ? GAME_META[server.game] : undefined;

    useEffect(() => {
        if (!server.map) return;
        loadMapImage(server.map, server.id).then(e => setImage(e ? e.small : null));
    }, [server.id, server.map]);

    return (
        <button
            type="button"
            onClick={() => onSelect(server.id)}
            aria-pressed={active}
            className={`w-full flex items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ring-inset ${
                active ? 'bg-primary/10 ring-1 ring-primary/50' : 'hover:bg-muted'
            }`}
        >
            <div className="rounded overflow-hidden w-12 h-7 flex-shrink-0 bg-muted">
                {image && <Image unoptimized width={48} height={28} src={image} alt={server.map} className="object-cover w-12 h-7"/>}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{server.map || '-'}</p>
                <p className="text-xs text-muted-foreground truncate">
                    {gameMeta && <span className={`font-semibold ${gameMeta.className}`}>{gameMeta.label}</span>}
                    {gameMeta && ' · '}
                    {server.community_name}
                </p>
            </div>
            <span className="text-sm tabular-nums flex-shrink-0">
                <span className="font-semibold">{server.players}</span>
                <span className="text-muted-foreground">/{server.max_players}</span>
            </span>
        </button>
    );
}

export default function LiveServerList({ servers, selectedId, onSelect }: {
    servers: Server[], selectedId: string | null, onSelect: (serverId: string) => void,
}) {
    const t = useTranslations('maps.global');
    const players = servers.reduce((sum, server) => sum + server.players, 0);

    return (
        <div className="flex flex-col h-full border border-border rounded-lg bg-card">
            <div className="flex items-baseline gap-2 px-4 pt-4 pb-2">
                <span className="text-xs uppercase tracking-widest font-bold text-primary">{t('live')}</span>
                <span className="text-sm font-semibold">{t('serversCount', {count: servers.length})}</span>
                <span className="text-xs text-muted-foreground">{t('playersCount', {count: players})}</span>
            </div>
            {servers.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">{t('noLiveServers')}</p>
            ) : (
                <ScrollArea className="flex-1 min-h-0 px-2 pb-2">
                    <div className="space-y-0.5">
                        {servers.map(server => (
                            <LiveServerRow key={server.id} server={server} active={server.id === selectedId} onSelect={onSelect}/>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}
