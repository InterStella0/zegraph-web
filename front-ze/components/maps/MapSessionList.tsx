'use client'
import {ReactNode, useEffect, useMemo, useState} from "react";
import dayjs from "lib/dayjs";
import {fetchServerUrl, range} from "utils/generalUtils.ts";
import SessionPlayedGraph from "../graphs/SessionPlayedGraph.tsx";
import PaginationPage from "../ui/PaginationPage.tsx";
import {Users, Trophy, AlertTriangle} from "lucide-react";
import {useMapResource, useMapScope} from "lib/hooks/useMapScope";
import MapServerLabel from "components/maps/global/MapServerLabel";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {usePeriod} from "components/period/Period";
import {useResource} from "lib/hooks/useResource";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import Link from "next/link";
import {ServerMapPlayed, ServerMapPlayedPaginated} from "types/maps.ts";
import {Skeleton, SkeletonText} from "components/ui/skeleton";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {Button} from "components/ui/button";
import {useTranslations} from 'next-intl';
import {Card} from "components/ui/card.tsx";
import {cn} from "components/lib/utils";
import {PeriodHeading} from "components/maps/MapCardTitle";
import {withMapSuspense} from "components/maps/withMapSuspense";

const NO_SESSIONS: ServerMapPlayed[] = [];

type MapSessionListProps = { initialDataPromise?: Promise<ServerMapPlayedPaginated | null> }

function MapSessionListDisplay({ initialDataPromise }: MapSessionListProps){
    const t = useTranslations('maps.sessionList');
    const { name } = useMapContext();
    const { period } = usePeriod();
    const { server } = useMapScope()
    const [page, setPage] = useState<number>(0)

    useEffect(() => {
        setPage(0)
    }, [server?.id, name, period])

    const { data, loading, error: fetchError } = useMapResource<ServerMapPlayedPaginated>('/sessions', initialDataPromise, {
        params: { page }, deps: [page], keepData: true, keepError: true,
    })
    const error = fetchError && (fetchError.message || t('somethingWrong'))
    const sessions = data?.maps ?? NO_SESSIONS
    const sessionGraphs = useMemo(() => sessions.map((session, index) => <SessionGraph key={index} session={session} />), [sessions])
    const totalPages = Math.ceil((data?.total_sessions ?? 0) / 5)

    return (
        <Card>
            <div className="p-2">
                <div className={cn("grid grid-cols-1 lg:grid-cols-12 gap-4", !error && "mb-4")}>
                    <div className="lg:col-span-4">
                        <PeriodHeading className="flex-wrap" titleClassName="text-lg text-start" title={t('title')} />
                    </div>
                    {error ? (
                        <div className="col-span-full">
                            <div className="min-h-[835px] flex gap-4 justify-center items-center">
                                <AlertTriangle className="h-5 w-5" />
                                <p className="text-base">{error}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="lg:col-span-8">
                                <div className="flex items-center justify-center lg:justify-end w-full">
                                    <PaginationPage page={page} setPage={setPage} totalPages={totalPages} compact />
                                </div>
                            </div>
                            <div className="col-span-full">
                                {loading
                                    ? range(5).map(index => <SkeletonSessionGraph key={index} />)
                                    : sessionGraphs}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
}

function SessionLayout({ title, meta, graph, footer }: Record<'title' | 'meta' | 'graph' | 'footer', ReactNode>) {
    return (
        <div className="m-2">
            <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 flex flex-row flex-wrap items-center justify-between gap-x-2 gap-y-0.5 m-2">
                    {title}
                    <div className="flex flex-row items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                        {meta}
                    </div>
                </div>
                <div className="col-span-full">
                    <div className="m-2 border border-border rounded-lg">
                        {graph}
                    </div>
                </div>
                <div className="col-span-full">
                    <div className="flex items-center m-2 mt-0 justify-between">
                        {footer}
                    </div>
                </div>
            </div>
        </div>
    );
}

function SkeletonSessionGraph(){
    const t = useTranslations('maps.sessionList');
    return (
        <SessionLayout
            title={<div className="text-sm sm:text-base">{t('sessionHash')}<Skeleton className="inline-block align-middle h-3.5 sm:h-4 w-14" /></div>}
            meta={<>
                <span><SkeletonText className="h-3 sm:h-3.5 w-[5.9rem]" /></span>
                <span>•</span>
                <span><SkeletonText className="h-3 sm:h-3.5 w-12" /></span>
            </>}
            graph={<Skeleton className="w-full h-[50px]" />}
            footer={<Skeleton className="h-8 w-[7.7rem] rounded-md" />}
        />
    );
}

function SessionGraph({ session }: { session: ServerMapPlayed }){
    const t = useTranslations('maps.sessionList');
    const { server, sessionHref } = useMapScope()
    const server_id = session.server_id
    const { name } = useMapContext()
    const toDayjs = useLocalDayjs()
    const { data: matchData } = useResource(() => session.time_id
        ? fetchServerUrl(server_id, `/sessions/${session.time_id}/match`)
        : null, [server_id, session.time_id])
    const startedAt = toDayjs(session.started_at)
    const endedAt = session.ended_at? toDayjs(session.ended_at): toDayjs()

    return (
        <SessionLayout
            title={
                <div className="flex flex-col min-w-0">
                    <p className="text-sm sm:text-base">{t('sessionNumber', {id: session.time_id})}</p>
                    {!server && <MapServerLabel serverId={session.server_id} />}
                </div>
            }
            meta={<>
                <Tooltip>
                    <TooltipTrigger>
                        <span suppressHydrationWarning>
                            {dayjs().diff(startedAt, 'd') < 1 ? startedAt.fromNow() : startedAt.format(startedAt.year() !== dayjs().year() ? 'MMM D YYYY, h:mma' : 'MMM D, h:mma')}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('playedAt', {time: startedAt.format('lll')})}</TooltipContent>
                </Tooltip>
                <span>•</span>
                <Tooltip>
                    <TooltipTrigger>
                        <span>{t('minutes', {count: endedAt.diff(startedAt, "m")})}</span>
                    </TooltipTrigger>
                    <TooltipContent>{t('sessionDuration')}</TooltipContent>
                </Tooltip>
            </>}
            graph={<SessionPlayedGraph serverId={server_id} sessionId={session.time_id} map={name} />}
            footer={<>
                <Button asChild variant="outline" size="sm">
                    <Link href={sessionHref(session)}>
                        <Users className="mr-2 h-4 w-4" />
                        {t('matchInfo')}
                    </Link>
                </Button>

                {matchData && (
                    <Tooltip>
                        <TooltipTrigger>
                            <div className="flex flex-row gap-1.5 items-center">
                                <Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
                                <span className="text-sm sm:text-base">
                                    {matchData.human_score} : {matchData.zombie_score}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <div className="text-center">
                                <p>{t('humanVsZombie')}</p>
                                <p className="text-xs">{t('finalScore')}</p>
                            </div>
                        </TooltipContent>
                    </Tooltip>
                )}
            </>}
        />
    );
}

export default withMapSuspense(MapSessionListDisplay, t => t('maps.sessionList.noSessionFound'))
