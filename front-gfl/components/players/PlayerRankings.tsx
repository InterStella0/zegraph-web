'use client'
import {useTranslations} from 'next-intl';
import {useState, useEffect, use} from 'react';
import { Search, Trophy, Loader2 } from 'lucide-react';
import {fetchApiServerUrl, fetchServerUrl, simpleRandom} from "utils/generalUtils";
import PlayerListItem from "./PlayerListItem";
import {PlayersTableRanked, RankingMode, SearchPlayer} from "types/players";
import {ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Input } from "components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "components/ui/tabs";
import { Skeleton } from "components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "components/ui/pagination";
import PaginationPage from "components/ui/PaginationPage.tsx";

const PlayerListSkeleton = ({ count = 5, showMatchedSkeleton = false }) => {
    const [isClient, setIsClient] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])
    return <>
        {showMatchedSkeleton && (
            <div className="p-4 bg-accent/50 rounded-md mb-4">
                <Skeleton className="w-2/5 h-5"/>
            </div>
        )}
        <div className="space-y-2">
            {Array.from({length: count}).map((_, index) => (
                <div
                    key={index}
                    className="rounded-md mb-2 border border-border p-3 min-h-[74px] flex items-center gap-3"
                >
                    <Skeleton className="w-10 h-10 rounded-full flex-shrink-0"/>
                    <div className="flex flex-row justify-between w-full">
                        <div>
                            <Skeleton className="h-6 mb-1" style={{width: isClient? `${simpleRandom(3, 13)}rem`: '0rem'}}/>
                            <Skeleton className="w-20 h-5 mt-1"/>
                        </div>
                        <div className="flex items-center gap-2">
                            <Skeleton className="w-15 h-8"/>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </>
};
const rankingModes: RankingMode[] = [
    {id: 'total', labelKey: 'modeTotalTime', value: 'Total'},
    {id: 'casual', labelKey: 'modeCasual', value: 'Casual'},
    {id: 'tryhard', labelKey: 'modeTryhard', value: 'TryHard'},
]
const PlayerRankings = ({ serverPromise }: { serverPromise: ServerSlugPromise }) => {
    const t = useTranslations('players.rankings');
    const server = use(serverPromise)
    const serverId = server.id;
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
    const [rankingTab, setRankingTab] = useState<number>(0);
    const [rankingPage, setRankingPage] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [playerRankings, setPlayerRankings] = useState<PlayersTableRanked | null>(null);
    const [playerRankingsLoading, setPlayerRankingsLoading] = useState<boolean>(true);
    const [playerRankingsError, setPlayerRankingsError] = useState<string | null>(null);
    const [searchSuggestions, setSearchSuggestions] = useState<SearchPlayer[]>([]);
    const [searchLoading, setSearchLoading] = useState<boolean>(false);
    const [searchInputValue, setSearchInputValue] = useState<string>('');
    const currentMode = rankingModes[rankingTab]

    const fetchSearchSuggestions = async (inputValue: string) => {
        if (!inputValue.trim()) {
            setSearchSuggestions([]);
            return;
        }
        try {
            setSearchLoading(true);
            const params = {player_name: inputValue};
            const data: SearchPlayer[] = await fetchApiServerUrl(serverId, '/players/autocomplete', {params});
            setSearchSuggestions(data || []);
        } catch (error) {
            console.error('Error fetching search suggestions:', error);
            setSearchSuggestions([]);
        } finally {
            setSearchLoading(false);
        }
    };

    const handleSearchInputChange = (newValue: string) => {
        setSearchInputValue(newValue);
        setSearchTerm(newValue);

        if (!newValue.trim()) {
            setDebouncedSearchTerm('');
        }
    };

    const handleKeyPress = (event: any) => {
        if (event.key === 'Enter' && searchTerm.trim()) {
            setDebouncedSearchTerm(searchTerm.trim());
        }
    };

    useEffect(() => {
        const controller = new AbortController()
        const signal = controller.signal;
        setPlayerRankingsLoading(true);
        setPlayerRankingsError(null);
        const params = {
            page: rankingPage,
            mode: currentMode.value,
            ...(debouncedSearchTerm.trim() && {player_name: debouncedSearchTerm.trim()})
        };
        fetchApiServerUrl(serverId, '/players/table', {params, signal})
            .then(data => {
                setPlayerRankings(data)
                setTotalPages(Math.ceil((data?.total_players || 0) / 5))
            })
            .catch(error => {
                if (signal.aborted) {
                    return
                }
                console.error('Error fetching player rankings:', error)
                setPlayerRankingsError(error.message)
            }).finally(() => setPlayerRankingsLoading(false))
            return () => {
                controller.abort("Changed");
            }
    }, [serverId, rankingPage, debouncedSearchTerm, currentMode]);

    useEffect(() => {
        setRankingPage(0);
    }, [debouncedSearchTerm, rankingTab]);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setDebouncedSearchTerm('');
            return;
        }

        const timeoutId = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 3000);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchSearchSuggestions(searchInputValue).catch(console.error);
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [searchInputValue, serverId]);

    return (
        <Card className="mb-6">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
                <Trophy className="w-5 h-5 text-primary"/>
                <h2 className="text-lg max-sm:text-md font-semibold">{t('title')}</h2>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                    <Input
                        placeholder={t('searchPlaceholder')}
                        value={searchInputValue}
                        onChange={(e) => handleSearchInputChange(e.target.value)}
                        onKeyUp={handleKeyPress}
                        className="pl-10 pr-10"
                    />
                    {searchLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground"/>
                    )}
                </div>

                <Tabs value={rankingTab.toString()} onValueChange={(v) => setRankingTab(Number(v))} className="mb-4">
                    <TabsList className="grid w-full grid-cols-3">
                        {rankingModes.map((mode, index) => (
                            <TabsTrigger key={mode.id} value={index.toString()}>
                                {t(mode.labelKey)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {playerRankingsLoading ? (
                    <PlayerListSkeleton showMatchedSkeleton={!!debouncedSearchTerm} />
                ) : playerRankingsError ? (
                    <div className="p-4 text-center">
                        <p className="text-destructive">Error loading player rankings: {playerRankingsError}</p>
                    </div>
                ) : (
                    <>
                        {playerRankings?.players?.length === 0 ? (
                            <div className="p-8 text-center">
                                <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                                    {t('noPlayersFound')}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {debouncedSearchTerm ?
                                        t('noResultsFor', {query: debouncedSearchTerm}) :
                                        t('noPlayersAvailable')
                                    }
                                </p>
                            </div>
                        ) : (
                            <>
                                {debouncedSearchTerm && (
                                    <div className="p-4 bg-accent/50 rounded-md mb-4">
                                        <p className="text-sm text-muted-foreground">
                                            Found {playerRankings?.total_players?.toLocaleString() || 0} players matching "{debouncedSearchTerm}"
                                        </p>
                                    </div>
                                )}
                                <div>
                                    {playerRankings?.players?.map((player) => (
                                        <PlayerListItem
                                            key={player.id}
                                            player={player}
                                            mode={rankingModes[rankingTab].value}
                                            server={server}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

                <div className="flex justify-center mt-4">
                    <PaginationPage totalPages={totalPages} page={rankingPage} setPage={setRankingPage} />
                </div>
            </CardContent>
        </Card>
    );
};

export default PlayerRankings;