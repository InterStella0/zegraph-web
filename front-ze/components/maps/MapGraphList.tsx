'use client'
import {useTranslations} from 'next-intl';
import {use, useEffect, useRef, useState} from 'react';
import {fetchServerUrl } from "utils/generalUtils.ts";
import dayjs, {Dayjs} from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat"
import MapCard from "./MapCard.tsx";
import MapCardSkeleton from "./MapCardSkeleton.tsx";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {ServerMapPlayed, ServerMapPlayedPaginated} from "types/maps.ts";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {ScrollArea, ScrollBar} from "components/ui/scroll-area.tsx";
dayjs.extend(LocalizedFormat)

export function MapGraphListLoading() {
    const t = useTranslations('maps');
    return <>
        <div className="flex flex-col sm:flex-row justify-between items-center p-2 px-4">
            <h2 className="text-sm text-muted-foreground uppercase tracking-wide">
                {t('sessions')}
            </h2>
            <PaginationPage page={0} setPage={() => {}} totalPages={1} />
        </div>
        <ScrollArea>
            <div className="flex overflow-x-auto gap-3 p-4">
                {Array.from({length: 10}).map((_, i) => <MapCardSkeleton key={i} />)}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </>
}

export default function MapGraphList(
    { onDateChange, initialDataPromise }: {
        onDateChange: (newStart: Dayjs, newEnd: Dayjs) => void,
        initialDataPromise: Promise<ServerMapPlayedPaginated | null>,
    }
) {
    const t = useTranslations('maps');
    const initialData = use(initialDataPromise)
    const [ page, setPage ] = useState<number>(0)
    const [ mapData, setMapData ] = useState<ServerMapPlayedPaginated | null>(initialData)
    const [ loading, setLoading ] = useState<boolean>(initialData === null)
    const { server } = useServerData()
    const server_id = server.id
    const isFirstRun = useRef(initialData !== null)

    useEffect(() => {setPage(0)}, [server_id])
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false
            return
        }
        setLoading(true)
        fetchServerUrl(server_id, `/maps/all/sessions`, { params: { page }})
            .then(resp => {
                setMapData(resp)
                setLoading(false)
            })

    }, [server_id, page]);

    const handleMapClick = (detail: ServerMapPlayed) => {
        onDateChange(dayjs(detail.started_at), detail.ended_at != null? dayjs(detail.ended_at): dayjs())
    }

    const totalPages = Math.ceil(mapData?.total_sessions ?? 0 / 10)
    return <>
        <div className="flex flex-col sm:flex-row justify-between items-center p-2 px-4">
            <h2 className="text-sm text-muted-foreground uppercase tracking-wide">
                {t('sessions')}
            </h2>
            <PaginationPage page={page} setPage={setPage} totalPages={totalPages} />
        </div>
        <ScrollArea>
        <div
            className="flex overflow-x-auto gap-3 p-4"
        >   {loading && Array.from({length: 10}).map((_, i) => <MapCardSkeleton key={i} />)}
            {!loading && mapData && mapData.maps.map((mapDetail) =>
                <MapCard key={mapDetail.time_id} detail={mapDetail} onClick={handleMapClick} server={server} />
            )}
        </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </>
}
