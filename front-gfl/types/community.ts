import { DetailedPlayer } from "./players";

export interface Server {
    id: string;
    name: string;
    players: number;
    max_players: number;
    status: boolean; // online/offline
    fullIp: string; // `${ip}:${port}`
    readable_link?: string | null;
    gotoLink: string;
    community_id: string;
    community_name: string;
    community_shorten_name: string;
    community_icon: string | null;
    website: string | null;
    discordLink: string | null;
    source: string | null;
    byId: boolean;
    map: string;
    game?: string | null;
}

export interface CommunityBase {
    id: string;
    name: string;
    shorten_name: string;
    icon_url?: string | null;
}

export interface Community extends CommunityBase {
    players: number;
    status: boolean;
    color: string;
    servers: Server[];
}

export interface ServerPlayerDetail {
    server_id: string;
    server_name: string;
    player: DetailedPlayer;
}

export interface CommunityPlayerDetail extends CommunityBase {
    servers: ServerPlayerDetail[];
}
