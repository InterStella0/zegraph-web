'use client'
import { useEffect, useMemo, useState} from "react";
import dayjs from "dayjs";
import {fetchServerUrl} from "utils/generalUtils.ts";
import SessionPlayedGraph from "../graphs/SessionPlayedGraph.tsx";
import PaginationPage from "../ui/PaginationPage.tsx";
import {Users, Trophy, AlertTriangle} from "lucide-react";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import relativeTime from "dayjs/plugin/relativeTime";
import Link from "next/link";
import {ServerMapPlayed} from "types/maps.ts";
import {Skeleton} from "components/ui/skeleton";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "components/ui/tooltip";
import {Button} from "components/ui/button";
import {
    Pagination,
    PaginationContent,
    PaginationFirst,
    PaginationItem, PaginationLast, PaginationLink, PaginationNext,
    PaginationPrevious
} from "components/ui/pagination.tsx";

dayjs.extend(relativeTime);

function AllSessions(){
    const { name } = useMapContext();
    const [page, setPage] = useState<number>(0)
    const [ sessions, setSessions ] = useState<ServerMapPlayed[]>([])
    const [ totalSessions, setTotalSessions ] = useState(0)
    const [ loading, setLoading ] = useState<boolean>(false)
    const [ error, setError ] = useState<string | null>(null)
    const { server } = useServerData()
    const server_id = server.id

    useEffect(() => {
        setPage(0)
    }, [server_id, name])

    useEffect(() => {
        const abort = new AbortController()
        setLoading(true)
        fetchServerUrl(server_id, `/maps/${name}/sessions`, { params: { page }, signal: abort.signal })
            .then(resp => {
                setSessions(resp.maps)
                setTotalSessions(resp.total_sessions)
            })
            .catch(e => {
                if (e === "New Page") return
                setError(e.message || "Something went wrong")
            })
            .finally(() => setLoading(false))
        return () => {
            abort.abort("New Page")
        }
    }, [server_id, page, name]);
    const sessionGraphs = useMemo(() => {
        return [...sessions.map((e, index) => <SessionGraph key={index} session={e} />)]
    }, [sessions])

    if (error){
        return (
            <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-4">
                        <h2 className="text-lg font-bold text-primary text-start">Sessions</h2>
                    </div>
                    <div className="col-span-full">
                        <div className="min-h-[835px] flex gap-4 justify-center items-center">
                            <AlertTriangle className="h-5 w-5" />
                            <p className="text-base">{error || "Something went wrong :/"}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    const totalPages = Math.ceil((totalSessions ?? 0) / 5)
    return (
        <TooltipProvider>
            <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
                    <div className="lg:col-span-4">
                        <h2 className="text-lg font-bold text-primary text-start">Sessions</h2>
                    </div>
                    <div className="lg:col-span-8">
                        <div className="flex items-center justify-center lg:justify-end w-full">
                            <PaginationPage page={page} setPage={setPage} totalPages={totalPages} compact />
                        </div>
                    </div>
                    <div className="col-span-full">
                        {loading && (
                            <>
                                {Array.from({length: 5}).map((_, index) => <SkeletonSessionGraph key={index} />)}
                            </>
                        )}
                        {!loading && sessionGraphs}
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

function SkeletonSessionGraph(){
    return (
        <div className="m-2">
            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-1">
                    <div className="flex flex-row">
                        <p className="m-2 text-start">Session #</p>
                        <Skeleton className="w-8 h-8" />
                    </div>
                </div>
                <div className="col-span-1">
                    <div className="flex flex-row justify-end gap-2 m-2">
                        <Skeleton className="w-30 h-4" />
                        <p>•</p>
                        <Skeleton className="w-12 h-4" />
                    </div>
                </div>
                <div className="col-span-full">
                    <div className="m-2 overflow-hidden border border-border rounded-lg">
                        <Skeleton className="w-full h-12" />
                    </div>
                </div>
                <div className="col-span-1">
                    <div className="flex m-2 mt-0">
                        <Skeleton className="w-27 h-8 rounded" />
                    </div>
                </div>
            </div>
        </div>
    );
}


function SessionGraph({ session }: { session: ServerMapPlayed }){
    const { server } = useServerData()
    const server_id = server?.id
    const { name } = useMapContext()
    const [ matchData, setMatchData ] = useState(null)
    useEffect(() => {
        if (!session?.time_id) return
        const sessionId = session.time_id
        fetchServerUrl(server_id, `/sessions/${sessionId}/match`)
            .then(setMatchData)
    }, [server_id, session?.time_id]);
    const startedAt = dayjs(session.started_at)
    const endedAt = session.ended_at? dayjs(session.ended_at): dayjs()

    return (
        <div className="m-2">
            <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 flex flex-row flex-wrap items-center justify-between gap-x-2 gap-y-0.5 m-2">
                    <p className="text-sm sm:text-base">Session #{session.time_id}</p>
                    <div className="flex flex-row items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                        <Tooltip>
                            <TooltipTrigger>
                                <span>
                                    {dayjs().diff(startedAt, 'd') < 1 ? startedAt.fromNow() : startedAt.format(startedAt.year() !== dayjs().year() ? 'MMM D YYYY, h:mma' : 'MMM D, h:mma')}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>Played at {startedAt.format('lll')}</TooltipContent>
                        </Tooltip>
                        <span>•</span>
                        <Tooltip>
                            <TooltipTrigger>
                                <span>{endedAt.diff(startedAt, "m")}mins</span>
                            </TooltipTrigger>
                            <TooltipContent>Session duration</TooltipContent>
                        </Tooltip>
                    </div>
                </div>
                <div className="col-span-full">
                    <div className="m-2 border border-border rounded-lg">
                        <SessionPlayedGraph sessionId={session.time_id} map={name} />
                    </div>
                </div>
                <div className="col-span-full">
                    <div className="flex items-center m-2 mt-0 justify-between">
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                        >
                            <Link href={`/servers/${server.gotoLink}/maps/${name}/sessions/${session?.time_id}`}>
                                <Users className="mr-2 h-4 w-4" />
                                Match Info
                            </Link>
                        </Button>

                        {matchData && (
                            <Tooltip>
                                <TooltipTrigger>
                                    <div className="flex flex-row gap-1.5 items-center">
                                        <Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
                                        <span className="text-sm sm:text-base">
                                            {matchData?.human_score} : {matchData?.zombie_score}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <div className="text-center">
                                        <p>Human Score : Zombie Score</p>
                                        <p className="text-xs">Final score (Mostly accurate)</p>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MapSessionListDisplay(){
    return (
        <div className="bg-card">
            <AllSessions />
        </div>
    );
}

export default function MapSessionList(){
    return <ErrorCatch message="No session found.">
        <MapSessionListDisplay />
    </ErrorCatch>
}
