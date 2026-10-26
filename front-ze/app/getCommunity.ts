import {fetchUrl} from "utils/generalUtils";
import {Community, Server} from "types/community";

export class CommunitiesData{
    public communities: Community[];
    public serversMapped = new Map<string, Server>();
    constructor(communities: Community[]){
        this.communities = communities;
        const servers = communities.flatMap(community => community.servers);
        // Ids are set after readable links so an id always wins a key collision.
        for (const server of servers)
            if (server.readable_link) this.serversMapped.set(server.readable_link, server);
        for (const server of servers)
            this.serversMapped.set(String(server.id), server);
    }
}

export async function getCommunity(options: object = { next: { revalidate: 60 } }): Promise<Community[]>{
    return fetchUrl("/communities", options)
        .then(resp => (resp.map(e => ({
            id: e.id,
            name: e.name,
            shorten_name: e.shorten_name,
            players: e.servers.reduce((prev, curr) => prev + curr.player_count, 0),
            status: e.servers.some(s => s.online),
            color: '#4A90E2',
            icon_url: e.icon_url,
            servers: e.servers.map(s => ({
                id: s.id,
                name: s.name,
                players: s.player_count,
                max_players: s.max_players,
                status: s.online,
                fullIp: `${s.ip}:${s.port}`,
                readable_link: s.readable_link,
                gotoLink: s.readable_link || s.id,
                community_id: e.id,
                community_name: e.name,
                community_shorten_name: e.shorten_name,
                community_icon: e.icon_url ?? null,
                website: s.website,
                discordLink: s.discord_link,
                source: s.source,
                byId: s.by_id,
                map: s.map,
                game: s.game,
                tracking_since: s.tracking_since ?? null,
            }))
        })) as Community[]).sort((a, b) => b.players - a.players))
        .catch(() => [])
}

export async function getCommunityData(): Promise<CommunitiesData>{
    return new CommunitiesData(await getCommunity());
}