'use client'
import {useTranslations} from 'next-intl';
import {useState, useEffect, useRef, use} from 'react';
import { Search, Trophy, Loader2 } from 'lucide-react';
import {fetchApiServerUrl, simpleRandom} from "utils/generalUtils";
import PlayerListItem from "./PlayerListItem";
import {PlayersTableRanked, RankingMode, SearchPlayer} from "types/players";
import {ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Input } from "components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import { Skeleton } from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "components/ui/command";
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {PlayerName} from "./PlayerName";

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
const SUGGESTION_MIN_CHARS = 3;
const SUGGESTION_DEBOUNCE_MS = 300;
const COMMIT_DEBOUNCE_MS = 3000; // preserves existing 3s tuning for the /players/table query

const rankingModes: RankingMode[] = [
    {id: 'total', labelKey: 'modeTotalTime', value: 'Total'},
    {id: 'casual', labelKey: 'modeCasual', value: 'Casual'},
    {id: 'tryhard', labelKey: 'modeTryhard', value: 'TryHard'},
]

type PlayerRankingsProps = { serverPromise: ServerSlugPromise, initialDataPromise: Promise<PlayersTableRanked> };

const PlayerRankingsDisplay = ({ serverPromise, initialDataPromise }: PlayerRankingsProps) => {
    const t = useTranslations('players.rankings');
    const server = use(serverPromise)
    const serverId = server.id;
    const initialData = use(initialDataPromise);
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
    const [rankingTab, setRankingTab] = useState<number>(0);
    const [rankingPage, setRankingPage] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(Math.max(1, Math.ceil((initialData?.total_players || 0) / 5)));
    const [playerRankings, setPlayerRankings] = useState<PlayersTableRanked | null>(initialData);
    const [playerRankingsLoading, setPlayerRankingsLoading] = useState<boolean>(false);
    const [playerRankingsError, setPlayerRankingsError] = useState<string | null>(null);
    const isFirstRun = useRef(true);
    const [suggestions, setSuggestions] = useState<SearchPlayer[]>([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState<boolean>(false);
    const [suggestionsOpen, setSuggestionsOpen] = useState<boolean>(false);
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [searchInput, setSearchInput] = useState<string>('');
    const currentMode = rankingModes[rankingTab]
    const isSuggestionsOpen = suggestionsOpen && (suggestionsLoading || suggestions.length > 0);

    const commitSearch = (value: string) => {
        setDebouncedSearchTerm(value.trim());
        setSuggestionsOpen(false);
        setSelectedIndex(-1);
    };

    const handleSearchInputChange = (value: string) => {
        setSearchInput(value);
        setSelectedIndex(-1);
        setSuggestionsOpen(value.trim().length >= SUGGESTION_MIN_CHARS);
    };

    const handleSelectSuggestion = (playerName: string) => {
        setSearchInput(playerName);
        commitSearch(playerName);
    };

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' && isSuggestionsOpen) {
            event.preventDefault();
            setSelectedIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0);
        } else if (event.key === 'ArrowUp' && isSuggestionsOpen) {
            event.preventDefault();
            setSelectedIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1);
        } else if (event.key === 'Enter') {
            if (isSuggestionsOpen && selectedIndex >= 0) {
                handleSelectSuggestion(suggestions[selectedIndex].name);
            } else {
                commitSearch(searchInput);
            }
        }
    };

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
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
        const trimmed = searchInput.trim();
        if (!trimmed) {
            setDebouncedSearchTerm('');
            return;
        }

        const timer = setTimeout(() => {
            setDebouncedSearchTerm(trimmed);
        }, COMMIT_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        const trimmed = searchInput.trim();
        if (trimmed.length < SUGGESTION_MIN_CHARS) {
            setSuggestions([]);
            setSuggestionsLoading(false);
            return;
        }

        const abortController = new AbortController();
        const signal = abortController.signal;
        const timer = setTimeout(() => {
            setSuggestionsLoading(true);
            fetchApiServerUrl(serverId, '/players/autocomplete', {params: {player_name: trimmed}, signal})
                .then((data: SearchPlayer[]) => setSuggestions(data ?? []))
                .catch(error => {
                    if (signal.aborted) return;
                    console.error('Error fetching search suggestions:', error);
                    setSuggestions([]);
                })
                .finally(() => setSuggestionsLoading(false));
        }, SUGGESTION_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            abortController.abort("Changed");
        };
    }, [serverId, searchInput]);

    return (
        <Card className="mb-6">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
                <Trophy className="w-5 h-5 text-primary"/>
                <h2 className="text-lg max-sm:text-md font-semibold">{t('title')}</h2>
            </CardHeader>
            <CardContent className="pt-0">
                <Popover open={isSuggestionsOpen} onOpenChange={setSuggestionsOpen}>
                    <PopoverTrigger asChild>
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                            <Input
                                placeholder={t('searchPlaceholder')}
                                value={searchInput}
                                onChange={(e) => handleSearchInputChange(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                onFocus={() => {
                                    if (searchInput.trim().length >= SUGGESTION_MIN_CHARS) setSuggestionsOpen(true);
                                }}
                                className="pl-10 pr-10"
                            />
                            {suggestionsLoading && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground"/>
                            )}
                        </div>
                    </PopoverTrigger>
                    <PopoverContent
                        className="p-0"
                        align="start"
                        style={{width: 'var(--radix-popover-trigger-width)'}}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                        <Command shouldFilter={false}>
                            <CommandList>
                                <CommandEmpty>{t('noSuggestions')}</CommandEmpty>
                                <CommandGroup>
                                    {suggestions.map((option, index) => (
                                        <CommandItem
                                            key={option.id}
                                            value={option.name}
                                            data-selected={index === selectedIndex}
                                            onSelect={() => handleSelectSuggestion(option.name)}
                                        >
                                            <PlayerName
                                                name={option.name}
                                                isAnonymous={option.is_anonymous}
                                                hiddenFromOthers={option.hidden_from_others}
                                                className="font-medium"
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

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

export function PlayerRankingsLoading() {
    const t = useTranslations('players.rankings');
    return (
        <Card className="mb-6">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
                <Trophy className="w-5 h-5 text-primary"/>
                <h2 className="text-lg max-sm:text-md font-semibold">{t('title')}</h2>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                    <Input placeholder={t('searchPlaceholder')} disabled className="pl-10"/>
                </div>
                <PlayerListSkeleton/>
            </CardContent>
        </Card>
    );
}

const PlayerRankings = ({ serverPromise, initialDataPromise }: PlayerRankingsProps) => {
    return (
        <ErrorCatch message="Player rankings couldn't be loaded.">
            <PlayerRankingsDisplay serverPromise={serverPromise} initialDataPromise={initialDataPromise}/>
        </ErrorCatch>
    );
};

export default PlayerRankings;