'use client'
import {ReactElement, useEffect, useState} from "react";
import { Info, AlertTriangle } from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import {fetchServerUrl} from "utils/generalUtils.ts";
import PlayerTableRow, {PlayerTableRowLoading} from "../players/PlayerTableRow.tsx";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {ExtendedPlayerBrief} from "types/players.ts";
import {useTranslations} from 'next-intl';

function MapTop10PlayerListDisplay(): ReactElement{
    const t = useTranslations('maps.top10');
    const { name } = useMapContext()
    const [ playersInfoResult, setPlayerInfo ] = useState<ExtendedPlayerBrief[]>(null)
    const [ loading, setLoading ] = useState<boolean>(false)
    const [ error, setError ] = useState<string | null>(null)
    const { server } = useServerData()
    const server_id = server.id

    useEffect(() => {
        const abortController = new AbortController()
        const signal = abortController.signal
        setLoading(true)
        setPlayerInfo(null)
        fetchServerUrl(server_id, `/maps/${name}/top_players`, { signal })
            .then(data => {
                for(const p of data)
                    p.server_id = server_id
                setPlayerInfo(data)
            })
            .catch(e => {
                if (e === "Value changed") return
                setError(e.message || t('somethingWrongFace'))
            })
            .finally(() => setLoading(false))
        return () => {
            abortController.abort("Value changed")
        }
    }, [server_id, name])
    const playersInfo = playersInfoResult ?? []
    const absoluteLoad = !loading
    return (
        <Card className="w-full">
            <div className="p-4 flex justify-between">
                <h2 className="text-lg font-bold text-primary">{t('title')}</h2>
                <div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Info className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{t('tooltip')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
            {error && <div className="min-h-[712px] flex items-center justify-center gap-2">
                <AlertTriangle />
                <p>{error || t('somethingWrong')}</p>
            </div>}
            {!error && <div className="p-4 min-h-[712px]">
                <Table>
                    <TableBody>
                        {(loading || playersInfoResult == null) && Array
                            .from({length: 10})
                            .map((_, index) => <PlayerTableRowLoading key={index}/>)
                        }
                        {!(loading || playersInfoResult == null) && playersInfo.length === 0 && <TableRow>
                            <TableCell colSpan={2}>{t('noPlayers')}</TableCell>
                        </TableRow>
                        }
                        {absoluteLoad && playersInfo.map(player => <PlayerTableRow player={player} key={player.id}/>)}
                    </TableBody>
                </Table>
            </div>}
        </Card>
    )
}
export default function MapTop10PlayerList(): ReactElement{
    const t = useTranslations('maps.top10');
    return <ErrorCatch message={t('loadError')}>
        <MapTop10PlayerListDisplay />
    </ErrorCatch>
}