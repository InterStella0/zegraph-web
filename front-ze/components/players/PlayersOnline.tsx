'use client'
import {useTranslations} from 'next-intl';
import {use} from 'react';
import { Gamepad2 } from 'lucide-react';
import { fetchServerUrl } from "utils/generalUtils.ts";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {PlayerDetailSession} from "types/players.ts";
import { Skeleton, SkeletonText } from "components/ui/skeleton";
import {useResource} from "lib/hooks/useResource";
import {OnlinePlayerRow, OnlinePlayersPanel, OnlinePlayersSkeleton, sessionDuration} from "./OnlinePlayers";
import {IconCard} from "./IconCard";
import {SearchField} from "components/ui/SearchField";
import {withErrorCatch} from "components/common/withErrorCatch";

const PlayersOnlineDisplay = ({ initialDataPromise }: { initialDataPromise: Promise<PlayerDetailSession[]> }) => {
    const t = useTranslations('players.online');
    const initialData = use(initialDataPromise);
    const { server } = useServerData()
    const serverId = server.id
    const { data, loading, error } = useResource<PlayerDetailSession[]>(
        () => fetchServerUrl(serverId, '/players/playing').then(data => data || []),
        [serverId], { initial: initialData || [], keepData: true, errorLog: 'Error fetching online players:' });

    return (
        <OnlinePlayersPanel
            namespace="players.online"
            className="mb-6"
            items={data ?? []}
            loading={loading}
            error={error?.message}
            perPage={20}
            matches={(player, query) => player.name.toLowerCase().includes(query)}
            renderRow={player => (
                <OnlinePlayerRow
                    key={player.session_id}
                    player={player}
                    href={`/servers/${server.gotoLink}/players/${player.id}`}
                    playingFor={t('playingFor', {duration: sessionDuration(player.started_at, true)})}
                />
            )}
        />
    );
};

export function PlayersOnlineLoading() {
    const t = useTranslations('players.online');
    return (
        <IconCard
            icon={Gamepad2}
            className="mb-6"
            heading={<div className="text-lg max-sm:text-md font-semibold"><SkeletonText className="h-5 w-32"/></div>}
            action={<Skeleton className="h-8 w-8"/>}
        >
            <SearchField className="mb-4" placeholder={t('searchPlayers')} disabled/>
            <OnlinePlayersSkeleton />
            <div className="flex justify-center pt-4">
                <Skeleton className="h-9 w-64"/>
            </div>
        </IconCard>
    );
}

export default withErrorCatch(PlayersOnlineDisplay, () => "Online players couldn't be loaded.")
