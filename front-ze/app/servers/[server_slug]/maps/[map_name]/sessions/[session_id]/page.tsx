import {
    getMutualSessions,
    getServerSlugOrNotFound,
    getSessionInfo,
    SessionInfo
} from "../../../../util";
import {metadataFallback, serverMetadata, sessionSummary} from "../../../../serverMetadata";
import {fetchServerUrl, formatTitle, getMapImage, GetMapImageReturn} from "utils/generalUtils";
import { MapSessionMatch} from "types/maps";
import {Metadata} from "next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import {Suspense} from "react";
import ResolveMapSession from "./ResolveMapSession.tsx";
import {MapSessionWrapperLoading} from "./MapSessionWrapper.tsx";
import getSessionData from "./utils.ts";
import { notFound } from 'next/navigation';

dayjs.extend(relativeTime);
dayjs.extend(timezone)

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string, map_name: string, session_id: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t, { map_name, session_id }) => {
        let info: SessionInfo<"map"> | null = null;
        try{
            info = await getSessionInfo(server.id, session_id, "map", map_name)
        }catch(error){
            return metadataFallback(error, "map", formatTitle(map_name), server, t, [404, 400])
        }
        let description = await sessionSummary(t, info, ['werePlayingIt', 'arePlayingIt'], server.id, session_id, map_name, "map")

        try{
            const sessionMatches: MapSessionMatch[] = await fetchServerUrl(server.id, `/sessions/${session_id}/all-match`)
            if (sessionMatches) {
                const matches = sessionMatches.sort((a, b) => dayjs(b.occurred_at).diff(a.occurred_at, 'seconds', true))
                const match = matches[0]
                const matchCounts = match.zombie_score + match.human_score

                if (info.ended_at)
                    description += ' ' + t('roundsFinalScore', {rounds: matchCounts, human: match.human_score, zombie: match.zombie_score})
                else
                    description += ' ' + t('roundsScore', {rounds: matchCounts, human: match.human_score, zombie: match.zombie_score})
            }
        }catch(error){}

        if (!info.ended_at){
            description += ' ' + t('playingSince', {time: dayjs(info.started_at).fromNow()});
        }else{
            description += ' ' + t('playedItAt', {time: dayjs(info.started_at).format('MMM D, YYYY h:mm A')});
        }
        try{
            const players = await getMutualSessions(server.id, session_id, "map", map_name)

            description += ` There were ${players.length} unique players in this session.`
        }catch(error){}

        let image = ""
        try{
            const pfp: GetMapImageReturn = await getMapImage(server.id, map_name)
            image = pfp?.large || ""
        }catch(error){

        }

        return {
            title: `${map_name}'s Session on ${server.community_name}`,
            description,
            path: `/maps/${map_name}/sessions/${session_id}`,
            social: {images: [image]},
        }
    })
}


export default async function Page({ params }) {
    const { session_id, server_slug, map_name } = await params;
    const server = await getServerSlugOrNotFound(server_slug);
    try {
        await getSessionInfo(server.id, session_id, "map", map_name);
    } catch (error: any) {
        if (error?.code === 404 || error?.code === 400) notFound();
        throw error;
    }

    const sessionDataPromise = getSessionData(server, map_name, session_id);

    return (
        <Suspense fallback={<MapSessionWrapperLoading />}>
            <ResolveMapSession sessionPromise={sessionDataPromise} />
        </Suspense>
    );
}