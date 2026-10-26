'use client'
import {ReactElement, useDeferredValue, useEffect, useRef, useState} from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "../ui/card";
import {SuggestSearch, useSuggestSearch} from "components/ui/SuggestSearch";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import {fetchApiServerUrl, range} from "utils/generalUtils.ts";
import PlayerTableRow, {PlayerTableRowLoading} from "../players/PlayerTableRow.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {usePeriod} from "components/period/Period";
import {useMapResource, useMapScope} from "lib/hooks/useMapScope";
import {BriefPlayers, ExtendedPlayerBrief, SearchPlayer} from "types/players.ts";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {useTranslations} from 'next-intl';
import {PlayerName} from "components/players/PlayerName";
import MapCardTitle from "components/maps/MapCardTitle";
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
    const { server, playerHref } = useMapScope()
    const server_id = server?.id ?? null
    const search = useSuggestSearch<SearchPlayer>({
        fetch: (player_name, signal) => server_id
            ? fetchApiServerUrl(server_id, '/players/autocomplete', { params: { player_name }, signal })
                .then((data: SearchPlayer[]) => (data ?? []).filter(p => !p.is_bot))
            : Promise.resolve([]),
        toTerm: value => value.trim().length >= SUGGESTION_MIN_CHARS ? value.trim() : '',
        minChars: SUGGESTION_MIN_CHARS,
        suggestDelay: SUGGESTION_DEBOUNCE_MS,
        commitDelay: COMMIT_DEBOUNCE_MS,
        onCommit: () => setPage(0),
    })
    const searchTerm = search.term
    const { data: playersInfoResult, setData, loading, error: fetchError } = useMapResource<BriefPlayers>('/top_players', initialDataPromise, {
        params: { page: pageDef, ...(searchTerm && { player_name: searchTerm }) },
        deps: [pageDef, searchTerm],
        keepData: true,
        keepError: true,
    })
    const error = fetchError && (fetchError.message || t('somethingWrongFace'))

    const mounted = useRef(false)
    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true
            return
        }
        setData(null)
        setPage(0)
        search.reset()
    }, [server_id, name, period])

    const playersInfo = (playersInfoResult?.players ?? []) as ExtendedPlayerBrief[]
    const totalPages = Math.ceil((playersInfoResult?.total_players ?? 0) / PAGE_SIZE)
    const absoluteLoad = pageDef === currentPage && !loading && playersInfoResult != null
    return (
        <Card className="w-full">
            <MapCardTitle className="px-4 pt-4 pb-1" title={t('title')} tooltip={t('tooltip')} />
            {error && <div className="min-h-[712px] flex items-center justify-center gap-2 px-4">
                <AlertTriangle />
                <p>{error}</p>
            </div>}
            {!error && <div className="min-h-[712px] px-4">
                <div className="pb-2">
                    <SuggestSearch
                        search={search}
                        placeholder={t('searchPlaceholder')}
                        empty={t('noSuggestions')}
                        itemValue={option => option.name}
                        itemKey={option => option.id}
                        renderItem={option => <PlayerName
                            name={option.name}
                            isAnonymous={option.is_anonymous}
                            hiddenFromOthers={option.hidden_from_others}
                            className="font-medium"
                        />}
                    />
                </div>
                <Table>
                    <TableBody>
                        {!absoluteLoad && range(PAGE_SIZE).map(index => <PlayerTableRowLoading key={index} showRank/>)}
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
