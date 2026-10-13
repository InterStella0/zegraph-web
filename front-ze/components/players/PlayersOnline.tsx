'use client'
import {useTranslations} from 'next-intl';
import {useState, useMemo, use, ChangeEvent} from 'react';
import { Gamepad2 } from 'lucide-react';
import { fetchServerUrl } from "utils/generalUtils.ts";
import dayjs from "dayjs";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import duration from "dayjs/plugin/duration";
import {PlayerDetailSession} from "types/players.ts";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {useResource} from "lib/hooks/useResource";
import {OnlinePlayerRow, OnlinePlayersCard, SearchField} from "./OnlinePlayers";
import {withErrorCatch} from "components/common/withErrorCatch";
dayjs.extend(duration);

const PlayerListSkeleton = ({ count = 20 }) => (
    <div className="p-2 space-y-1">
        {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="py-1 flex items-center gap-3">
                <div className="relative flex-shrink-0">
                    <Skeleton className="w-[40px] h-[40px] rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                        <Skeleton className="inline-block align-middle h-3.5" style={{ width: `${5 + (index * 3) % 6}rem` }} />{'\u200b'}
                    </div>
                    <div className="text-xs">
                        <Skeleton className="inline-block align-middle h-3 w-24" />{'\u200b'}
                    </div>
                </div>
            </div>
        ))}
    </div>
);

type PlayersOnlineProps = { initialDataPromise: Promise<PlayerDetailSession[]> };

const PlayersOnlineDisplay = ({ initialDataPromise }: PlayersOnlineProps) => {
    const t = useTranslations('players.online');
    const initialData = use(initialDataPromise);
    const [onlinePage, setOnlinePage] = useState<number>(0);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const { server } = useServerData()
    const serverId = server.id
    const { data, loading: onlinePlayersLoading, error } = useResource<PlayerDetailSession[]>(
        () => fetchServerUrl(serverId, '/players/playing').then(data => data || []),
        [serverId], { initial: initialData || [], keepData: true, errorLog: 'Error fetching online players:' });
    const onlinePlayers = data ?? [];
    const onlinePlayersError = error?.message;

    const PLAYERS_PER_PAGE = 20;

    const filteredPlayers = useMemo(() => {
        if (!searchQuery.trim()) return onlinePlayers;
        return onlinePlayers.filter(player =>
            player.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [onlinePlayers, searchQuery]);

    const getPaginatedPlayers = () => {
        const startIndex = onlinePage * PLAYERS_PER_PAGE;
        const endIndex = startIndex + PLAYERS_PER_PAGE;
        return filteredPlayers.slice(startIndex, endIndex);
    };

    const totalPages = Math.ceil(filteredPlayers.length / PLAYERS_PER_PAGE)

    const getSessionDuration = (startedAt: string): string => {
        const delta = dayjs(dayjs()).diff(startedAt, "second");
        const deltaDur = dayjs.duration(delta, "seconds");
        const hours = deltaDur.hours();
        const minutes = deltaDur.minutes();

        if (hours > 0)
            return `${hours}h ${minutes}m`;

        return `${minutes}m`;
    };

    const handleSearchChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setSearchQuery(e.target.value);
        setOnlinePage(0);
    }

    return (
        <OnlinePlayersCard
            className="mb-6"
            title={t('title', {count: onlinePlayers.length})}
            info={t('offlineDelayInfo')}
            search={{placeholder: t('searchPlayers'), value: searchQuery, onChange: handleSearchChange}}
        >
            {onlinePlayersLoading ? (
                <PlayerListSkeleton count={20} />
            ) : onlinePlayersError ? (
                <div className="p-4 text-center">
                    <p className="text-destructive">{t('loadError', {error: onlinePlayersError})}</p>
                </div>
            ) : (
                <>
                    {filteredPlayers.length === 0 && searchQuery.trim() ? (
                        <div className="p-6 text-center">
                            <p className="text-muted-foreground">
                                {t('noPlayerName', {query: searchQuery})}
                            </p>
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {getPaginatedPlayers().map((player) => (
                                <OnlinePlayerRow
                                    key={player.session_id}
                                    player={player}
                                    href={`/servers/${server.gotoLink}/players/${player.id}`}
                                    playingFor={t('playingFor', {duration: getSessionDuration(player.started_at)})}
                                />
                            ))}
                        </div>
                    )}
                    {totalPages > 1 && (
                        <div className="flex justify-center pt-4">
                            <PaginationPage page={onlinePage} setPage={setOnlinePage} totalPages={totalPages} />
                        </div>
                    )}
                </>
            )}
        </OnlinePlayersCard>
    );
};

export function PlayersOnlineLoading() {
    const t = useTranslations('players.online');
    return (
        <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-primary" />
                    <div className="text-lg max-sm:text-md font-semibold">
                        <Skeleton className="inline-block align-middle h-5 w-32"/>{'\u200b'}
                    </div>
                </div>
                <Skeleton className="h-8 w-8"/>
            </CardHeader>
            <CardContent className="pt-0">
                <SearchField placeholder={t('searchPlayers')} disabled/>
                <PlayerListSkeleton count={20} />
                <div className="flex justify-center pt-4">
                    <Skeleton className="h-9 w-64"/>
                </div>
            </CardContent>
        </Card>
    );
}

export default withErrorCatch(PlayersOnlineDisplay, () => "Online players couldn't be loaded.")

