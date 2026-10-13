'use client'
import {useTranslations} from 'next-intl';
import {use, useState, useEffect, useMemo, ChangeEvent} from 'react';
import {Gamepad2, Info, Circle, Search} from 'lucide-react';
import {fetchApiUrl} from "utils/generalUtils";
import {PlayerAvatar} from "./PlayerAvatar.tsx";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import {PlayerDetailSessionCommunity} from "types/players.ts";
import {Card, CardContent, CardHeader} from "components/ui/card";
import {Input} from "components/ui/input";
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {Skeleton} from "components/ui/skeleton";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "components/ui/tooltip";
import {Button} from "components/ui/button";
import PaginationPage from "components/ui/PaginationPage.tsx";
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {useServerMap} from "components/ui/ServerProvider.tsx";
import {PlayerName} from "./PlayerName";
dayjs.extend(duration);

const PLAYERS_PER_PAGE = 15;
const REFRESH_MS = 60_000;

function GlobalPlayersOnlineSkeleton({count = PLAYERS_PER_PAGE}: { count?: number }) {
    return (
        <div className="p-2 space-y-1">
            {Array.from({length: count}).map((_, index) => (
                <div key={index} className="py-1 flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full flex-shrink-0"/>
                    <div className="flex-1">
                        <Skeleton className="w-3/5 h-5 mb-1"/>
                        <Skeleton className="w-4/5 h-4"/>
                    </div>
                </div>
            ))}
        </div>
    );
}

function getSessionDuration(startedAt: string): string {
    const delta = dayjs().diff(startedAt, "second");
    const deltaDur = dayjs.duration(delta, "seconds");
    const hours = Math.floor(deltaDur.asHours());
    const minutes = deltaDur.minutes();

    if (hours > 0)
        return `${hours}h ${minutes}m`;

    return `${minutes}m`;
}

export function GlobalPlayersOnlineLoading() {
    const t = useTranslations('players.globalOnline');
    return (
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-primary"/>
                    <Skeleton className="h-6 w-32"/>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                    <Input placeholder={t('searchPlayers')} disabled className="pl-10"/>
                </div>
                <GlobalPlayersOnlineSkeleton/>
            </CardContent>
        </Card>
    );
}

function GlobalPlayersOnlineDisplay({ initialDataPromise }: { initialDataPromise: Promise<PlayerDetailSessionCommunity[]> }) {
    const t = useTranslations('players.globalOnline');
    const initialPlayers = use(initialDataPromise);
    const [players, setPlayers] = useState<PlayerDetailSessionCommunity[]>(initialPlayers || []);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState<number>(0);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const {serversMapped} = useServerMap();

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const load = (initial: boolean) => {
            if (initial) setLoading(true);
            fetchApiUrl('/communities/all/players/playing', {signal})
                .then((data: PlayerDetailSessionCommunity[]) => {
                    setPlayers(data || []);
                    setError(null);
                })
                .catch(error => {
                    if (signal.aborted) return;
                    console.error('Error fetching global online players:', error);
                    setError(error.message);
                })
                .finally(() => {
                    if (!signal.aborted) setLoading(false);
                });
        };

        const interval = setInterval(() => load(false), REFRESH_MS);
        return () => {
            clearInterval(interval);
            controller.abort("Unmounted");
        };
    }, []);

    // The server is only shown as a community logo, so search stays the sole way to filter by
    // server. Match the community name too, since that's what the logo actually identifies.
    const filteredPlayers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return players;
        return players.filter(({player_detail, server_id}) => {
            if (player_detail.name.toLowerCase().includes(query)) return true;
            const server = serversMapped.get(server_id);
            if (!server) return false;
            return !!server.name?.toLowerCase().includes(query)
                || !!server.community_name?.toLowerCase().includes(query);
        });
    }, [players, searchQuery, serversMapped]);

    const totalPages = Math.ceil(filteredPlayers.length / PLAYERS_PER_PAGE);
    const paginatedPlayers = filteredPlayers.slice(page * PLAYERS_PER_PAGE, (page + 1) * PLAYERS_PER_PAGE);

    const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setPage(0);
    };

    return (
        <TooltipProvider>
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-primary"/>
                    <h2 className="text-lg max-sm:text-md font-semibold">
                        {t('title', {count: players.length})}
                    </h2>
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Info className="w-4 h-4"/>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{t('offlineDelayInfo')}</p>
                    </TooltipContent>
                </Tooltip>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                    <Input
                        placeholder={t('searchPlayers')}
                        value={searchQuery}
                        onChange={handleSearchChange}
                        className="pl-10"
                    />
                </div>

                {loading ? (
                    <GlobalPlayersOnlineSkeleton/>
                ) : error ? (
                    <div className="p-4 text-center">
                        <p className="text-destructive">{t('loadError')}</p>
                    </div>
                ) : filteredPlayers.length === 0 ? (
                    <div className="p-6 text-center">
                        <p className="text-muted-foreground">
                            {searchQuery.trim() ? t('noPlayerName', {query: searchQuery}) : t('noneOnline')}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="p-2 space-y-1">
                            {paginatedPlayers.map(({player_detail: player, server_id}) => {
                                const server = serversMapped.get(server_id);
                                return (
                                    <div
                                        key={player.session_id}
                                        className="py-1 rounded-md transition-all duration-200 flex items-center gap-3"
                                    >
                                        <div className="relative flex-shrink-0">
                                            <PlayerAvatar uuid={player.id} name={player.name}/>
                                            <Circle
                                                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
                                                style={{color: 'hsl(var(--success))'}}
                                                fill="currentColor"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {server ? (
                                                <HoverPrefetchLink
                                                    href={`/servers/${server.gotoLink}/players/${player.id}`}
                                                    className="text-sm font-medium hover:underline block truncate"
                                                >
                                                    <PlayerName
                                                        name={player.name}
                                                        isAnonymous={player.is_anonymous}
                                                        hiddenFromOthers={player.hidden_from_others}
                                                    />
                                                </HoverPrefetchLink>
                                            ) : (
                                                <PlayerName
                                                    name={player.name}
                                                    isAnonymous={player.is_anonymous}
                                                    hiddenFromOthers={player.hidden_from_others}
                                                    className="text-sm font-medium truncate block"
                                                />
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                {t('playingFor', {duration: getSessionDuration(player.started_at)})}
                                            </p>
                                        </div>
                                        {server && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Avatar className="w-6 h-6 flex-shrink-0 border border-border/50">
                                                        {server.community_icon && (
                                                            <AvatarImage
                                                                src={server.community_icon}
                                                                alt={server.community_name}
                                                            />
                                                        )}
                                                        <AvatarFallback className="text-[10px] font-medium">
                                                            {server.community_shorten_name?.slice(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{t('serverTooltip', {
                                                        community: server.community_name,
                                                        server: server.name
                                                    })}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {totalPages > 1 && (
                            <div className="flex justify-center pt-4">
                                <PaginationPage page={page} setPage={setPage} totalPages={totalPages} compact/>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
        </TooltipProvider>
    );
}

export default function GlobalPlayersOnline({ initialDataPromise }: { initialDataPromise: Promise<PlayerDetailSessionCommunity[]> }) {
    const t = useTranslations('players.globalOnline');
    return (
        <ErrorCatch message={t('loadError')}>
            <GlobalPlayersOnlineDisplay initialDataPromise={initialDataPromise}/>
        </ErrorCatch>
    );
}
