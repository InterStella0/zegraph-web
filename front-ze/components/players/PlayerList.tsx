import {useDeferredValue, useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import { fetchUrl } from "utils/generalUtils.ts";
import PlayerTableRow, {PlayerTableRowLoading} from "./PlayerTableRow.tsx";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {Dayjs} from "dayjs";
import {BriefPlayers, ExtendedPlayerBrief} from "types/players.ts";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "components/ui/table.tsx";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {withErrorCatch} from "components/common/withErrorCatch";


function PlayerListDisplay({ dateDisplay }: { dateDisplay: StartEndDates }) {
    const t = useTranslations('players.list');
    const [ currentPage, setPage ] = useState<number>(0)
    const pageDef = useDeferredValue(currentPage)
    const [ playersInfoResult, setPlayerInfo ] = useState<BriefPlayers | null>(null)
    const [ totalPlayers, setPlayerCount ] = useState<number>(0)
    const [ loading, setLoading ] = useState<boolean>(false)
    const { server } = useServerData()
    const server_id = server.id

    useEffect(() => {
        setPlayerInfo(null)
        setPlayerCount(0)
        setPage(0)
    }, [server_id])
    useEffect(() => {
      setPage(0)
    }, [dateDisplay])

    useEffect(() => {
        if (dateDisplay === null) return

        let { start, end } = dateDisplay
        if (!start.isBefore(end)) return
        const abortController = new AbortController()
        const signal = abortController.signal
        setLoading(true)
        const params = {
            start: start.toJSON(), 
            end: end.toJSON(),
            page: pageDef
        }

        fetchUrl(`/graph/${server_id}/players`, { params, signal })
            .then(data => {
                for (const p of data.players)
                    p.server_id = server_id
                setPlayerInfo(data)
                setPlayerCount(data.total_players)
                setLoading(false)
            })
            .catch(e => {
                if (e === "Value changed") return
                console.error(e)
                setLoading(false)
            })
        return () => {
            abortController.abort("Value changed")
        }
    }, [server_id, pageDef, dateDisplay])
    // @ts-ignore
    const playersInfo: ExtendedPlayerBrief[] = playersInfoResult?.players ?? []
    const absoluteLoad = pageDef === currentPage && !loading
    const totalPages = Math.ceil(totalPlayers / 70);

    return (
        <div className="w-full">
            <div className="max-h-[54vh] overflow-auto">
                <Table className="table-fixed">
                    <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                            <TableHead>{t('name')}</TableHead>
                            <TableHead className="w-24 text-right whitespace-normal leading-tight">{t('totalPlayTime')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(loading || pageDef !== currentPage || playersInfoResult == null) && Array
                            .from({length: 70})
                            .map((_, index) => <PlayerTableRowLoading key={index} compact/>)
                        }
                        {absoluteLoad && playersInfo.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={2}>{t('noPlayers')}</TableCell>
                            </TableRow>
                        )}
                        {absoluteLoad && playersInfo.map(player => <PlayerTableRow player={player} key={player.id} compact />)}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-between px-2 py-4 flex-col">
                <PaginationPage totalPages={totalPages} page={currentPage} setPage={setPage} compact />
                <div className="text-sm text-muted-foreground">
                    {t('pageInfo', {page: currentPage + 1, totalPages, totalPlayers})}
                </div>
            </div>
        </div>
      );
}
type StartEndDates = {
    start: Dayjs,
    end: Dayjs
} | null

export default withErrorCatch(PlayerListDisplay, t => t('players.list.loadError'))