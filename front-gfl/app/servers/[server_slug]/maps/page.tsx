import CurrentMatch from "components/maps/CurrentMatch";
import {fetchServerUrl, formatTitle, socialMeta} from "utils/generalUtils";
import {getServerSlug, threeMinutes} from "../util";
import MapsSearchIndex from "./MapsSearchIndex";
import getServerUser from "../../../getServerUser";
import {Metadata} from "next";
import {MapPlayedPaginated} from "types/maps.ts";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {Suspense} from "react";
import {getContinentStatsNow, getMatchNow} from "./util.ts";
import {AdSpot} from "components/ui/AdSpot";
import { getTranslations } from 'next-intl/server';
dayjs.extend(relativeTime)

export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string }>
}): Promise<Metadata> {
    const { server_slug } = await params

    const server = await getServerSlug(server_slug)
    const t = await getTranslations('metadata');
    if (!server)
        return {
        title: formatTitle(t('mapsTitleFallback'))
    }

    let description = t('playIntro', {name: server.community_name, ip: server.fullIp});
    try{
        const parameters = { page: 1, sorted_by: 'LastPlayed' }
        const data: MapPlayedPaginated = await fetchServerUrl(server.id, '/maps/last/sessions', { params: parameters, next: {revalidate: threeMinutes} });
        const latestMap = data.maps[0]
        description += ' ' + t('mapsPlayedLast', {count: data.total_maps, map: latestMap.map, time: dayjs(latestMap.last_played).fromNow()});
    }catch(e){}

    const title = formatTitle(t('mapsTitle', {name: server.community_name}))
    return {
        title,
        description,
        alternates: {
            canonical: `/servers/${server.gotoLink}/maps`
        },
        ...socialMeta({title, description})
    }
}

export default async function Page({ params }){
    const { server_slug } = await params;
    const server = getServerSlug(server_slug)
    const user = getServerUser()
    const matchData = server.then(e => getMatchNow(e.id))
    const playerContinents = server.then(e => getContinentStatsNow(e.id))

    return <div className="container max-w-screen-xl py-6 max-sm:px-0.5 mx-auto px-2">
        <Suspense fallback={null}>
            <CurrentMatch serverPromise={server} mapCurrentPromise={matchData} playerContinentsPromise={playerContinents} userPromise={user} />
        </Suspense>
        <AdSpot className="my-4" />
        <Suspense fallback={null}>
            <MapsSearchIndex serverPromise={server} userPromise={user} />
        </Suspense>
    </div>
}