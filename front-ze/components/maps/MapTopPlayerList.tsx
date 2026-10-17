'use client'
import {ReactElement, use, useDeferredValue, useEffect, useRef, useState} from "react";
import { AlertTriangle, Search, Loader2 } from "lucide-react";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { TooltipProvider } from "../ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "../ui/command";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import {fetchApiServerUrl, StillCalculate} from "utils/generalUtils.ts";
import PlayerTableRow, {PlayerTableRowLoading} from "../players/PlayerTableRow.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {PeriodChip, usePeriod} from "components/period/Period";
import {useNotReadyRetry} from "lib/hooks/useNotReadyRetry";
import {useMapScope} from "lib/hooks/useMapScope";
import {BriefPlayers, ExtendedPlayerBrief, SearchPlayer} from "types/players.ts";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {useTranslations} from 'next-intl';
import {PlayerName} from "components/players/PlayerName";
import InfoTooltip from "components/common/InfoTooltip";
import {withMapSuspense} from "components/maps/withMapSuspense";

const PAGE_SIZE = 10
const SUGGESTION_MIN_CHARS = 3
const SUGGESTION_DEBOUNCE_MS = 100
const COMMIT_DEBOUNCE_MS = 2000

type MapTopPlayerListProps = { initialDataPromise?: Promise<BriefPlayers | null> }

function MapTopPlayerListDisplay({ initialDataPromise }: MapTopPlayerListProps): ReactElement{
    const t = useTranslations('maps.top10');
    const { name } = useMapContext()
    const { period } = usePeriod()
    const [ currentPage, setPage ] = useState<number>(0)
    const pageDef = useDeferredValue(currentPage)
    const initialData = initialDataPromise ? use(initialDataPromise) : null
    const [ playersInfoResult, setPlayerInfo ] = useState<BriefPlayers | null>(initialData)
    const [ loading, setLoading ] = useState<boolean>(false)
    const [ error, setError ] = useState<string | null>(null)
    const [ notReady, setNotReady ] = useState<boolean>(false)
    const [ searchInput, setSearchInput ] = useState<string>('')
    const [ searchTerm, setSearchTerm ] = useState<string>('')
    const [ suggestions, setSuggestions ] = useState<SearchPlayer[]>([])
    const [ suggestionsLoading, setSuggestionsLoading ] = useState<boolean>(false)
    const [ suggestionsOpen, setSuggestionsOpen ] = useState<boolean>(false)
    const [ selectedIndex, setSelectedIndex ] = useState<number>(-1)
    const { server, fetchMap, playerHref } = useMapScope()
    const server_id = server?.id ?? null
    const isSuggestionsOpen = suggestionsOpen && (suggestionsLoading || suggestions.length > 0)
    const isFirstRun = useRef(initialData !== null)
    const [retryTick, setRetryTick] = useState(0)
    useNotReadyRetry(notReady, () => setRetryTick(t => t + 1))

    useEffect(() => {
        if (isFirstRun.current) return
        setPlayerInfo(null)
        setPage(0)
        setSearchInput('')
        setSearchTerm('')
        setSuggestions([])
        setSuggestionsOpen(false)
    }, [server_id, name, period])

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false
            return
        }
        if (!name) return
        const abortController = new AbortController()
        const signal = abortController.signal
        setLoading(true)
        fetchMap('/top_players', { params: { page: pageDef, ...(searchTerm && { player_name: searchTerm }), ...(period && { period }) }, signal })
            .then((data: BriefPlayers) => {
                if (server_id)
                    for(const p of data.players)
                        (p as ExtendedPlayerBrief).server_id = server_id
                setPlayerInfo(data)
                setError(null)
                setNotReady(false)
            })
            .catch(e => {
                if (e === "Value changed") return
                setNotReady(e instanceof StillCalculate)
                setError(e.message || t('somethingWrongFace'))
            })
            .finally(() => setLoading(false))
        return () => {
            abortController.abort("Value changed")
        }
    }, [server_id, name, pageDef, searchTerm, period, retryTick])

    useEffect(() => {
        const trimmed = searchInput.trim()
        // Name suggestions come from one server's players; across every server the search still
        // filters the list, just without suggestions.
        if (!server_id || trimmed.length < SUGGESTION_MIN_CHARS) {
            setSuggestions([])
            setSuggestionsLoading(false)
            return
        }
        const abortController = new AbortController()
        const signal = abortController.signal
        const timer = setTimeout(() => {
            setSuggestionsLoading(true)
            fetchApiServerUrl(server_id, '/players/autocomplete', { params: { player_name: trimmed }, signal })
                .then((data: SearchPlayer[]) => setSuggestions((data ?? []).filter(p => !p.is_bot)))
                .catch(e => {
                    if (e === "Value changed") return
                    setSuggestions([])
                })
                .finally(() => setSuggestionsLoading(false))
        }, SUGGESTION_DEBOUNCE_MS)
        return () => {
            clearTimeout(timer)
            abortController.abort("Value changed")
        }
    }, [server_id, searchInput])

    useEffect(() => {
        const trimmed = searchInput.trim()
        if (trimmed.length < SUGGESTION_MIN_CHARS) {
            setSearchTerm('')
            setPage(0)
            return
        }
        const timer = setTimeout(() => {
            setSearchTerm(trimmed)
            setPage(0)
        }, COMMIT_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [searchInput])

    const commitSearch = (value: string) => {
        const trimmed = value.trim()
        setSearchTerm(trimmed.length >= SUGGESTION_MIN_CHARS ? trimmed : '')
        setPage(0)
        setSuggestionsOpen(false)
        setSelectedIndex(-1)
    }

    const handleSelectSuggestion = (playerName: string) => {
        setSearchInput(playerName)
        commitSearch(playerName)
    }

    const handleSearchInputChange = (value: string) => {
        setSearchInput(value)
        setSelectedIndex(-1)
        setSuggestionsOpen(value.trim().length >= SUGGESTION_MIN_CHARS)
    }

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' && isSuggestionsOpen) {
            event.preventDefault()
            setSelectedIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0)
        } else if (event.key === 'ArrowUp' && isSuggestionsOpen) {
            event.preventDefault()
            setSelectedIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1)
        } else if (event.key === 'Enter') {
            if (isSuggestionsOpen && selectedIndex >= 0) {
                handleSelectSuggestion(suggestions[selectedIndex].name)
            } else {
                commitSearch(searchInput)
            }
        }
    }
    // @ts-ignore
    const playersInfo: ExtendedPlayerBrief[] = playersInfoResult?.players ?? []
    const totalPlayers = playersInfoResult?.total_players ?? 0
    const totalPages = Math.ceil(totalPlayers / PAGE_SIZE)
    const absoluteLoad = pageDef === currentPage && !loading && playersInfoResult != null
    return (
        <Card className="w-full">
            <div className="px-4 pt-4 pb-1 flex justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-primary">{t('title')}</h2>
                    <PeriodChip />
                </div>
                <div>
                    <TooltipProvider>
                        <InfoTooltip text={t('tooltip')} />
                    </TooltipProvider>
                </div>
            </div>
            {error && <div className="min-h-[712px] flex items-center justify-center gap-2 px-4">
                <AlertTriangle />
                <p>{error || t('somethingWrong')}</p>
            </div>}
            {!error && <div className="min-h-[712px] px-4">
                <div className="pb-2">
                    <Popover open={isSuggestionsOpen} onOpenChange={setSuggestionsOpen}>
                        <PopoverTrigger asChild>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchInput}
                                    onChange={(e) => handleSearchInputChange(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                    onFocus={() => {
                                        if (searchInput.trim().length >= SUGGESTION_MIN_CHARS)
                                            setSuggestionsOpen(true)
                                    }}
                                    placeholder={t('searchPlaceholder')}
                                    className="pl-10 pr-10"
                                />
                                {suggestionsLoading && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
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
                </div>
                <Table>
                    <TableBody>
                        {!absoluteLoad && Array
                            .from({length: PAGE_SIZE})
                            .map((_, index) => <PlayerTableRowLoading key={index} showRank/>)
                        }
                        {absoluteLoad && playersInfo.length === 0 && <TableRow>
                            <TableCell colSpan={2}>
                                {searchTerm ? t('noResultsFor', {query: searchTerm}) : t('noPlayers')}
                            </TableCell>
                        </TableRow>
                        }
                        {absoluteLoad && playersInfo.map(player => <PlayerTableRow player={player} key={player.id} showRank href={playerHref(player.id)}/>)}
                    </TableBody>
                </Table>
                <div className="flex items-center justify-center pt-4">
                    <PaginationPage totalPages={totalPages} page={currentPage} setPage={setPage} compact />
                </div>
            </div>}
        </Card>
    )
}
export default withMapSuspense(MapTopPlayerListDisplay, t => t('maps.top10.loadError'))
