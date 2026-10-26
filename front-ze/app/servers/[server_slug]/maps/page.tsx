import CurrentMatch, {CurrentMatchSkeleton} from "components/maps/CurrentMatch";
import {fetchApiServerUrl, fetchServerUrl, orNull} from "utils/generalUtils";
import {getServerSlugOrNotFound, threeMinutes} from "../util";
import {serverMetadata} from "../serverMetadata";
import MapsSearchIndex from "./MapsSearchIndex";
import getServerUser from "../../../getServerUser";
import {Metadata} from "next";
import {MapPlayedPaginated} from "types/maps.ts";
import dayjs from "lib/dayjs";
import {Suspense} from "react";
import {getContinentStatsNow, getMatchNow} from "./util.ts";
import {AdSpot} from "components/ui/AdSpot";

export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t) => {
        let description = t('playIntro', {name: server.community_name, ip: server.fullIp});
        const data = await orNull<MapPlayedPaginated>(fetchServerUrl(
            server.id, '/maps/last/sessions', { params: { page: 0, sorted_by: 'LastPlayed' }, next: {revalidate: threeMinutes} },
        ))
        const latestMap = data?.maps[0]
        if (latestMap)
            description += ' ' + t('mapsPlayedLast', {count: data.total_maps, map: latestMap.map, time: dayjs(latestMap.last_played).fromNow()});
        return {title: t('mapsTitle', {name: server.community_name}), description, path: '/maps', social: {}}
    })
}

export default async function Page({ params }){
    const { server_slug } = await params;
    const server = getServerSlugOrNotFound(server_slug)
    const user = getServerUser()
    const matchData = server.then(e => getMatchNow(e.id))
    const playerContinents = server.then(e => getContinentStatsNow(e.id))
    const mapsPromise: Promise<MapPlayedPaginated | null> = server
        .then(e => fetchApiServerUrl(e.id, '/maps/last/sessions', { params: { page: 0, sorted_by: 'LastPlayed' } }))
        .catch(() => null)

    return <div className="container max-w-screen-xl py-6 max-sm:px-0.5 mx-auto px-2">
        <Suspense fallback={<CurrentMatchSkeleton />}>
            <CurrentMatch serverPromise={server} mapCurrentPromise={matchData} playerContinentsPromise={playerContinents} userPromise={user} />
        </Suspense>
        <AdSpot className="my-4" />
        <Suspense fallback={<MapsSearchIndex serverPromise={server} userPromise={user} idle />}>
            <MapsSearchIndex serverPromise={server} userPromise={user} initialDataPromise={mapsPromise} />
        </Suspense>
    </div>
}