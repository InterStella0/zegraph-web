import {getServerSlugOrNotFound, oneDay, threeMinutes} from "../../util";
import {
    addOrdinalSuffix,
    DOMAIN,
    fetchServerUrl,
    fetchUrl,
    formatHours,
    formatTitle,
    socialMeta,
    StillCalculate
} from "utils/generalUtils";
import {getPlayerDetailed, PlayerInfo} from "./util";
import {Metadata} from "next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {PlayerMostPlayedMap, PlayerProfilePicture, PlayerRegionTime, PlayerSessionPage} from "types/players.ts";
import {Server} from "types/community.ts";
import ResolvePlayerInformation from "./ResolvePlayerInformation.tsx";
import {AdSpot} from "components/ui/AdSpot";
import { getTranslations } from 'next-intl/server';

dayjs.extend(relativeTime);
export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string, player_id: string }>
}): Promise<Metadata> {
    const { server_slug, player_id } = await params;
    const server = await getServerSlugOrNotFound(server_slug);
    const t = await getTranslations('metadata');
    let player: PlayerInfo | null = null
    try{
        player = await getPlayerDetailed(server.id, player_id, "raise")
    }catch(error){
        if (error.code === 202){
            return {
                title: formatTitle(player_id),
                description: t('playerCalculating'),
            }
        }else if (error.code === 404){
            return {
                title: "ZE Graph",
                description: t('viewPlayerActivities', {name: server.community_name})
            };
        }else{
            return {}
        }
    }
    let description = t('playerHas', {hours: formatHours(player.total_playtime)})
    try{
        const pages: PlayerSessionPage = await fetchServerUrl(
            server.id, `/players/${player.id}/sessions`, { params: { page: 1 }, next: { revalidate: threeMinutes } },
        )
        const totalRows = pages.rows.length * pages.total_pages
        description += t('aboutSessions', {count: totalRows})
    }catch (error){

    }
    if (player.ranks){
        description += ' ' + t('andRank', {rank: addOrdinalSuffix(player.ranks.server_playtime)})
    }
    description += ' ' + t('onServer', {name: server.community_name})
    if (player.category){
        let typePlayer
        if (player.category === "mixed"){
            const higherType =  player.casual_playtime > player.tryhard_playtime? "casual": "tryhard"
            typePlayer = t('playerType', {category: player.category, hours: formatHours(player[`${higherType}_playtime`]), type: higherType})
        }else{
            typePlayer = t('playerType', {category: player.category, hours: formatHours(player[`${player.category}_playtime`]), type: player.category})
        }
        description += ` ${typePlayer}`;
    }
    if (player.online_since){
        description += ' ' + t('currentlyOnline', {time: dayjs(player.online_since).fromNow()});
    }else{
        description += ' ' + t('lastOnline', {time: dayjs(player.last_played_ended).fromNow()});
    }
    let image = ""
    try{
        const pfp: PlayerProfilePicture | null = await fetchUrl(`/players/${player.id}/pfp`, {  next: { revalidate: oneDay } })
        image = pfp.full
    }catch(error){

    }

    try{
        const mostPlayed: PlayerMostPlayedMap[] = await fetchServerUrl(server.id, `/players/${player.id}/most_played_maps`)
        if (mostPlayed) {
            const fav = mostPlayed[0]
            description += ` Likes ${fav.map} with a playtime of ${formatHours(fav.duration)}.`
        }
    }catch(error){}
    try{
        const regions: PlayerRegionTime[] = await fetchServerUrl(server.id, `/players/${player.id}/regions`)
        if (regions) {
            regions.sort((a, b) => b.duration - a.duration);
            const region = regions[0]
            description += ` Mainly plays during ${region.name} time.`
        }
    }catch (error){

    }
    const title = formatTitle(`${player.name} on ${server.community_name}`)
    return {
        title: title,
        description: description,
        ...socialMeta({title, description, images: [image], noTwitter: true}),
        alternates: {
            canonical: `/servers/${server.gotoLink}/players/${player.id}`,
        },
    }
}
export type ServerPlayerDetailed = {
    server: Server,
    player: PlayerInfo | StillCalculate
}
export type ServerPlayerDetailedWithError = ServerPlayerDetailed & { error?: { code: number, message: string } }

export default async function Page({ params }: { params: Promise<{ server_slug: string, player_id: string }>}){
    const { server_slug, player_id } = await params;

    const server = await getServerSlugOrNotFound(server_slug);

    const serverPlayerPromise = (async () => {
        try {
            const player = await getPlayerDetailed(server.id, player_id, "return")
            return {player, server} as ServerPlayerDetailedWithError
        } catch (error: any) {
            return {
                player: null,
                server,
                error: {
                    code: error?.code || 500,
                    message: error?.message || "An error occurred"
                }
            } as ServerPlayerDetailedWithError
        }
    })()

    // Generate JSON-LD structured data for SEO
    const serverPlayer = await serverPlayerPromise;
    let jsonLd = null;

    if (serverPlayer.player && !('code' in serverPlayer.player)) {
        const player = serverPlayer.player;
        const server = serverPlayer.server;

        jsonLd = {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": player.name,
            "identifier": player.id.toString(),
            "memberOf": {
                "@type": "Organization",
                "name": server.community_name
            },
            "description": `Player on ${server.community_name} with ${formatHours(player.total_playtime)} of playtime`,
            "mainEntityOfPage": {
                "@type": "ProfilePage",
                "url": `${DOMAIN}/servers/${server.gotoLink}/players/${player.id}`
            }
        };

        // Add ranking if available
        if (player.ranks?.server_playtime) {
            jsonLd["award"] = `${addOrdinalSuffix(player.ranks.server_playtime)} rank on ${server.community_name}`;
        }
    }

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            <div className="p-4">
                <AdSpot className="mb-4" />
                <ResolvePlayerInformation serverPlayerPromise={serverPlayerPromise} />
            </div>
        </>
    );
}