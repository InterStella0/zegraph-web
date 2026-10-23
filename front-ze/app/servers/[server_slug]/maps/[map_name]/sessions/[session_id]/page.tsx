import {
    getMutualSessions,
    getServerSlugOrNotFound,
    getSessionInfo,
    SessionInfo
} from "../../../../util";
import {metadataFallback, serverMetadata, sessionSummary} from "../../../../serverMetadata";
import {fetchServerUrl, formatTitle, getMapImage, orNull} from "utils/generalUtils";
import { MapSessionMatch} from "types/maps";
import {Metadata} from "next";
import dayjs from "lib/dayjs";
import {Suspense} from "react";
import MapSessionWrapper, {MapSessionWrapperLoading} from "./MapSessionWrapper.tsx";
import getSessionData, {SessionData} from "./utils.ts";
import { notFound } from 'next/navigation';

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string, map_name: string, session_id: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t, { map_name, session_id }) => {
        let info: SessionInfo<"map">
        try{
            info = await getSessionInfo(server.id, session_id, "map", map_name)
        }catch(error){
            return metadataFallback(error, "map", formatTitle(map_name), server, t, [404, 400])
        }
        const [summary, sessionMatches, players, image] = await Promise.all([
            sessionSummary(t, info, ['werePlayingIt', 'arePlayingIt'], server.id, session_id, map_name, "map"),
            orNull<MapSessionMatch[]>(fetchServerUrl(server.id, `/sessions/${session_id}/all-match`)),
            orNull(getMutualSessions(server.id, session_id, "map", map_name)),
            getMapImage(server.id, map_name),
        ])
        let description = summary
        const match = sessionMatches?.sort((a, b) => dayjs(b.occurred_at).diff(a.occurred_at, 'seconds', true))[0]
        if (match) {
            const score = {rounds: match.zombie_score + match.human_score, human: match.human_score, zombie: match.zombie_score}
            description += ' ' + t(info.ended_at ? 'roundsFinalScore' : 'roundsScore', score)
        }
        if (!info.ended_at){
            description += ' ' + t('playingSince', {time: dayjs(info.started_at).fromNow()});
        }else{
            description += ' ' + t('playedItAt', {time: dayjs(info.started_at).format('MMM D, YYYY h:mm A')});
        }
        if (players)
            description += ` There were ${players.length} unique players in this session.`

        return {
            title: `${map_name}'s Session on ${server.community_name}`,
            description,
            path: `/maps/${map_name}/sessions/${session_id}`,
            social: {images: [image?.large || ""]},
        }
    })
}

const notFoundOnMissing = (error: any) => {
    if (error?.code === 404 || error?.code === 400) notFound();
    throw error;
}

async function ResolveMapSession({ sessionPromise }: { sessionPromise: Promise<SessionData> }) {
    return <MapSessionWrapper initialData={await sessionPromise} />;
}

export default async function Page({ params }) {
    const { session_id, server_slug, map_name } = await params;
    const server = await getServerSlugOrNotFound(server_slug);
    await getSessionInfo(server.id, session_id, "map", map_name).catch(notFoundOnMissing);

    return (
        <Suspense fallback={<MapSessionWrapperLoading />}>
            <ResolveMapSession sessionPromise={getSessionData(server, map_name, session_id).catch(notFoundOnMissing)} />
        </Suspense>
    );
}
