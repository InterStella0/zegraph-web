import {getServerSlugOrNotFound, oneDay, threeMinutes} from "../../util";
import {metadataFallback, serverMetadata} from "../../serverMetadata";
import {
    addOrdinalSuffix,
    DOMAIN,
    fetchServerUrl,
    fetchUrl,
    formatHours,
    formatTitle,
    orNull,
    StillCalculate
} from "utils/generalUtils";
import {getPlayerDetailed, getPlayerStatSeeds, PlayerInfo} from "./util";
import {Metadata} from "next";
import dayjs from "lib/dayjs";
import {PlayerMostPlayedMap, PlayerProfilePicture, PlayerRegionTime, PlayerSessionPage} from "types/players.ts";
import {Server} from "types/community.ts";
import ResolvePlayerInformation from "./ResolvePlayerInformation.tsx";
import {AdSpot} from "components/ui/AdSpot";
import {JsonLd} from "components/common/JsonLd";
import getServerUser from "../../../../getServerUser";
import {recordView} from "lib/recordView";

export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string, player_id: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t, { player_id }) => {
        let player: PlayerInfo
        try{
            player = await getPlayerDetailed(server.id, player_id, "raise")
        }catch(error){
            return metadataFallback(error, "player", formatTitle(player_id), server, t)
        }
        const playerPath = `/players/${player.id}`
        const [pages, pfp, mostPlayed, regions] = await Promise.all([
            orNull<PlayerSessionPage>(fetchServerUrl(server.id, `${playerPath}/sessions`, { params: { page: 1 }, next: { revalidate: threeMinutes } })),
            orNull<PlayerProfilePicture>(fetchUrl(`${playerPath}/pfp`, { next: { revalidate: oneDay } })),
            orNull<PlayerMostPlayedMap[]>(fetchServerUrl(server.id, `${playerPath}/most_played_maps`)),
            orNull<PlayerRegionTime[]>(fetchServerUrl(server.id, `${playerPath}/regions`)),
        ])
        let description = t('playerHas', {hours: formatHours(player.total_playtime)})
        if (pages)
            description += t('aboutSessions', {count: pages.rows.length * pages.total_pages})
        if (player.ranks)
            description += ' ' + t('andRank', {rank: addOrdinalSuffix(player.ranks.server_playtime)})
        description += ' ' + t('onServer', {name: server.community_name})
        if (player.category){
            const dominant = player.casual_playtime > player.tryhard_playtime ? "casual" : "tryhard"
            const type = player.category === "mixed" ? dominant : player.category
            description += ' ' + t('playerType', {category: player.category, hours: formatHours(player[`${type}_playtime`]), type})
        }
        if (player.online_since){
            description += ' ' + t('currentlyOnline', {time: dayjs(player.online_since).fromNow()});
        }else if (player.last_played_ended){
            description += ' ' + t('lastOnline', {time: dayjs(player.last_played_ended).fromNow()});
        }
        const favourite = mostPlayed?.[0]
        if (favourite)
            description += ` Likes ${favourite.map} with a playtime of ${formatHours(favourite.duration)}.`
        const region = regions?.sort((a, b) => b.duration - a.duration)[0]
        if (region)
            description += ` Mainly plays during ${region.name} time.`
        return {
            title: `${player.name} on ${server.community_name}`,
            description,
            path: playerPath,
            social: {images: [pfp?.full ?? ""], noTwitter: true},
        }
    })
}
export type ServerPlayerDetailed = {
    server: Server,
    player: PlayerInfo | StillCalculate
}
export type ServerPlayerDetailedWithError = ServerPlayerDetailed & { error?: { code: number, message: string } }

export default async function Page({ params, searchParams }: {
    params: Promise<{ server_slug: string, player_id: string }>,
    searchParams: Promise<{ period?: string }>,
}){
    const { server_slug, player_id } = await params;
    const { period } = await searchParams;

    const server = await getServerSlugOrNotFound(server_slug);
    const statSeeds = getPlayerStatSeeds(server.id, player_id, !!period);

    const serverPlayerPromise: Promise<ServerPlayerDetailedWithError> = getPlayerDetailed(server.id, player_id, "return")
        .then(player => ({player, server}))
        .catch(error => ({
            player: null,
            server,
            error: {
                code: error?.code || 500,
                message: error?.message || "An error occurred"
            }
        }))

    const { player } = await serverPlayerPromise;
    const found = player && !('code' in player) ? player : null;
    const jsonLd = found && {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": found.name,
        "identifier": found.id.toString(),
        "memberOf": {
            "@type": "Organization",
            "name": server.community_name
        },
        "description": `Player on ${server.community_name} with ${formatHours(found.total_playtime)} of playtime`,
        "mainEntityOfPage": {
            "@type": "ProfilePage",
            "url": `${DOMAIN}/servers/${server.gotoLink}/players/${found.id}`
        },
        ...(found.ranks?.server_playtime && {
            "award": `${addOrdinalSuffix(found.ranks.server_playtime)} rank on ${server.community_name}`
        }),
    };

    return (
        <>
            <JsonLd data={jsonLd} />
            <div className="p-4">
                <AdSpot className="mb-4" />
                <ResolvePlayerInformation
                    serverPlayerPromise={serverPlayerPromise}
                    userPromise={getServerUser()}
                    viewsPromise={found ? recordView('players', found.id) : Promise.resolve(null)}
                    statSeeds={statSeeds}
                />
            </div>
        </>
    );
}
