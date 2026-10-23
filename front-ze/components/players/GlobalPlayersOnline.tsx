'use client'
import {useTranslations} from 'next-intl';
import {use, useEffect, useState} from 'react';
import {Gamepad2} from 'lucide-react';
import {fetchApiUrl, NO_CACHE} from "utils/generalUtils";
import {PlayerDetailSessionCommunity} from "types/players.ts";
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {Skeleton} from "components/ui/skeleton";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {useServerMap} from "components/ui/ServerProvider.tsx";
import {useResource} from "lib/hooks/useResource";
import {OnlinePlayerRow, OnlinePlayersPanel, sessionDuration} from "./OnlinePlayers";
import {IconCard} from "./IconCard";
import {SearchField} from "components/ui/SearchField";
import {withErrorCatch} from "components/common/withErrorCatch";

const REFRESH_MS = 60_000;

export function GlobalPlayersOnlineLoading() {
    const t = useTranslations('players.globalOnline');
    return (
        <IconCard icon={Gamepad2} className="border-border/40 bg-card/50 backdrop-blur-xl" heading={<Skeleton className="h-6 w-32"/>}>
            <SearchField className="mb-4" placeholder={t('searchPlayers')} disabled/>
            <div className="p-2 space-y-1">
                {Array.from({length: 15}, (_, index) => (
                    <div key={index} className="py-1 flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-[8%] flex-shrink-0"/>
                        <div className="flex-1">
                            <Skeleton className="w-3/5 h-5 mb-1"/>
                            <Skeleton className="w-4/5 h-4"/>
                        </div>
                    </div>
                ))}
            </div>
        </IconCard>
    );
}

function GlobalPlayersOnlineDisplay({ initialDataPromise }: { initialDataPromise: Promise<PlayerDetailSessionCommunity[]> }) {
    const t = useTranslations('players.globalOnline');
    const initialPlayers = use(initialDataPromise);
    const {serversMapped} = useServerMap();
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setRefresh(n => n + 1), REFRESH_MS);
        return () => clearInterval(interval);
    }, []);
    const { data, error } = useResource<PlayerDetailSessionCommunity[]>(
        signal => fetchApiUrl('/communities/all/players/playing', {signal, ...NO_CACHE}).then(data => data || []),
        [refresh], { initial: initialPlayers || [], keepData: true, keepError: true, errorLog: 'Error fetching global online players:' });

    return (
        <OnlinePlayersPanel
            namespace="players.globalOnline"
            className="border-border/40 bg-card/50 backdrop-blur-xl"
            items={data ?? []}
            error={error?.message}
            perPage={15}
            matches={({player_detail, server_id}, query) => {
                if (player_detail.name.toLowerCase().includes(query)) return true;
                const server = serversMapped.get(server_id);
                return !!server?.name?.toLowerCase().includes(query)
                    || !!server?.community_name?.toLowerCase().includes(query);
            }}
            renderRow={({player_detail: player, server_id}) => {
                const server = serversMapped.get(server_id);
                return (
                    <OnlinePlayerRow
                        key={player.session_id}
                        player={player}
                        href={server ? `/servers/${server.gotoLink}/players/${player.id}` : null}
                        playingFor={t('playingFor', {duration: sessionDuration(player.started_at)})}
                    >
                        {server && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar className="w-6 h-6 flex-shrink-0 border border-border/50">
                                        {server.community_icon && (
                                            <AvatarImage src={server.community_icon} alt={server.community_name}/>
                                        )}
                                        <AvatarFallback className="text-[10px] font-medium">
                                            {server.community_shorten_name?.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t('serverTooltip', {community: server.community_name, server: server.name})}</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </OnlinePlayerRow>
                );
            }}
            showNoneOnline
            compact
        />
    );
}

export default withErrorCatch(GlobalPlayersOnlineDisplay, t => t('players.globalOnline.loadError'))
