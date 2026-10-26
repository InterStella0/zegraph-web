import {useDeferredValue, useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import { fetchUrl } from "utils/generalUtils.ts";
import PlayerTableRow, {PlayerTableRowLoading} from "./PlayerTableRow.tsx";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {Dayjs} from "dayjs";
import {BriefPlayers, ExtendedPlayerBrief} from "types/players.ts";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "components/ui/table.tsx";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {useResource} from "lib/hooks/useResource";
import {withErrorCatch} from "components/common/withErrorCatch";

const PAGE_SIZE = 70

type StartEndDates = { start: Dayjs, end: Dayjs } | null

function PlayerListDisplay({ dateDisplay }: { dateDisplay: StartEndDates }) {
    const t = useTranslations('players.list');
    const [ currentPage, setPage ] = useState<number>(0)
    const pageDef = useDeferredValue(currentPage)
    const { server } = useServerData()
    const server_id = server.id

    const { data, setData, loading } = useResource<BriefPlayers>(signal => {
        if (!dateDisplay?.start.isBefore(dateDisplay.end)) return null
        const params = { start: dateDisplay.start.toJSON(), end: dateDisplay.end.toJSON(), page: pageDef }
        return fetchUrl(`/graph/${server_id}/players`, { params, signal }).then(data => {
            for (const p of data.players)
                p.server_id = server_id
            return data
        })
    }, [server_id, pageDef, dateDisplay], { keepData: true, errorLog: 'Error fetching players:' })

    useEffect(() => {
        setData(null)
        setPage(0)
    }, [server_id, setData])
    useEffect(() => setPage(0), [dateDisplay])

    const playersInfo = (data?.players ?? []) as ExtendedPlayerBrief[]
    const totalPlayers = data?.total_players ?? 0
    const totalPages = Math.ceil(totalPlayers / PAGE_SIZE)
    const absoluteLoad = pageDef === currentPage && !loading

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
                        {(!absoluteLoad || data == null) && Array
                            .from({length: PAGE_SIZE}, (_, index) => <PlayerTableRowLoading key={index} compact/>)
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

export default withErrorCatch(PlayerListDisplay, t => t('players.list.loadError'))
