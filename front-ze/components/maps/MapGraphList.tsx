'use client'
import {useTranslations} from 'next-intl';
import {ReactNode, useEffect, useState} from 'react';
import {fetchServerUrl, range} from "utils/generalUtils.ts";
import dayjs, {Dayjs} from "lib/dayjs";
import MapCard from "./MapCard.tsx";
import MapCardSkeleton from "./MapCardSkeleton.tsx";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useResource} from "lib/hooks/useResource";
import {ServerMapPlayed, ServerMapPlayedPaginated} from "types/maps.ts";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {ScrollArea, ScrollBar} from "components/ui/scroll-area.tsx";

const PAGE_SIZE = 10
const cardSkeletons = () => range(PAGE_SIZE).map(i => <MapCardSkeleton key={i} />)

function SessionStrip({ page, setPage, totalPages, children }: {
    page: number, setPage: (page: number) => void, totalPages: number, children: ReactNode,
}) {
    const t = useTranslations('maps');
    return <>
        <div className="flex flex-col sm:flex-row justify-between items-center p-2 px-4">
            <h2 className="text-sm text-muted-foreground uppercase tracking-wide">
                {t('sessions')}
            </h2>
            <PaginationPage page={page} setPage={setPage} totalPages={totalPages} />
        </div>
        <ScrollArea>
            <div className="flex overflow-x-auto gap-3 p-4">
                {children}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </>
}

export function MapGraphListLoading() {
    return <SessionStrip page={0} setPage={() => {}} totalPages={1}>{cardSkeletons()}</SessionStrip>
}

export default function MapGraphList(
    { onDateChange, initialDataPromise }: {
        onDateChange: (newStart: Dayjs, newEnd: Dayjs) => void,
        initialDataPromise: Promise<ServerMapPlayedPaginated | null>,
    }
) {
    const [ page, setPage ] = useState<number>(0)
    const { server } = useServerData()
    const { data: mapData, loading } = useResource<ServerMapPlayedPaginated>(
        () => fetchServerUrl(server.id, `/maps/all/sessions`, { params: { page }}),
        [server.id, page],
        { seed: initialDataPromise, keepData: true },
    )

    useEffect(() => {setPage(0)}, [server.id])

    const handleMapClick = (detail: ServerMapPlayed) => {
        onDateChange(dayjs(detail.started_at), detail.ended_at != null? dayjs(detail.ended_at): dayjs())
    }

    return <SessionStrip page={page} setPage={setPage} totalPages={Math.ceil((mapData?.total_sessions ?? 0) / PAGE_SIZE)}>
        {loading ? cardSkeletons() : mapData?.maps.map(mapDetail =>
            <MapCard key={mapDetail.time_id} detail={mapDetail} onClick={handleMapClick} server={server} />
        )}
    </SessionStrip>
}
