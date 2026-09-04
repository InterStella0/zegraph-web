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
    tracking_since: string | null;
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

export interface LinkedName {
    name: string;
    total_playtime: number;
    is_current: boolean;
}

export interface ProfileRecentSession {
    started_at: string;
    ended_at: string | null;
    /** Session length in seconds; elapsed-so-far for a session still running. */
    duration: number;
}

export interface ProfileServerEntry {
    server_id: string;
    server_name: string;
    by_id: boolean;
    is_online: boolean;
    last_played: string | null;
    last_played_duration: number | null;
    player: DetailedPlayer;
    linked_names: LinkedName[];
    /** The player's last few sessions on this server, oldest first. */
    recent_sessions: ProfileRecentSession[];
}

export interface ProfileCommunityDetail extends CommunityBase {
    servers: ProfileServerEntry[];
}

export interface GlobalMapRank {
    position: number;
    map: string;
    rank: number;
}

export interface GlobalPlaytimeSummary {
    total_playtime: number;
    casual_playtime: number;
    tryhard_playtime: number;
    category: string | null;
    rank: number | null;
    casual_rank: number | null;
    tryhard_rank: number | null;
    total_ranked_players: number;
    server_count: number;
    community_count: number;
    is_outdated: boolean;
    is_calculating: boolean;
    calculated_at: string | null;
    rank_calculated_at: string | null;
}

export interface ProfileSummary {
    total_playtime: number;
    community_count: number;
    server_count: number;
    is_online: boolean;
    last_online: string | null;
    last_session_duration: number | null;
    best_rank: GlobalMapRank | null;
    global: GlobalPlaytimeSummary;
}

export interface UserAnonymization {
    user_id: number;
    community_id?: string;
    anonymized: boolean;
    hide_location: boolean;
}

export interface ProfileResponse {
    steamid: string;
    name: string | null;
    summary: ProfileSummary;
    communities: ProfileCommunityDetail[];
    is_owner: boolean;
    /** You may read and change this user's anonymization settings: you are them, or a superuser
     *  acting on their behalf. A superuser's change is written to the audit log. */
    can_manage_anonymization: boolean;
    anonymization: UserAnonymization[] | null;
}

export interface PlayerSessionTime {
    bucket_time: string;
    hours: number;
}
