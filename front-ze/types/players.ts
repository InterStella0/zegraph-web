import {InfractionInt} from "utils/generalUtils.ts";

export type RankMode = "Casual" | "TryHard" | "Total"
export interface RankingMode {
    id: string,
    labelKey: string,
    value: RankMode,
}
export interface PlayerTableRank{
    rank: number,
    id: string,
    name: string,
    tryhard_playtime: number,
    casual_playtime: number,
    mixed_playtime: number,
    total_playtime: number
    is_anonymous: boolean,
}
export type PlayersTableRanked = {
    total_players: number,
    players: PlayerTableRank[]
}

export type PlayerHourDay = {
    event_type: "Join" | "Leave",
    hour: number,
    count: number,
}

export type PlayerOnlineHeatmap = {
    hour_of_day: number,
    hours_online: number,
    online_count: number,
}

export type PlayerInfraction = {
    id: string,
    source: string,
    by: string,
    reason: string | null,
    infraction_time: string | null,
    flags: bigint | InfractionInt,
    admin_avatar: string | null,
}


export type PlayerInfractionUpdate = {
    id: number,
    infractions: PlayerInfraction[],
}
export interface PlayerBase{
    id: string,
    name: string,
    created_at: string,
}
export interface PlayerBrief extends PlayerBase{
    total_playtime: number,
    rank: number,
    online_since: string | null,
    last_played: string,
    last_played_ended: string | null,
    last_played_duration: number,
}

export interface ExtendedPlayerBrief extends PlayerBrief{
    server_id: string,
}

export type MapPlayerTypeTime = {
    category: string,
    time_spent: number,
}

export type BriefPlayers = {
    total_players: number,
    players: PlayerBrief[]
}

type MapRank = {
    rank: number,
    map: string,
    total_playtime: number
}
export type PlayerRanks = {
    global_playtime: number,
    server_playtime: number,
    casual_playtime: number,
    mixed_playtime: number,
    tryhard_playtime: number,
    highest_map_rank: MapRank | null,
}
export interface DetailedPlayer extends PlayerBase{
    id: string,
    name: string,
    aliases: string[],
    category: "casual" | "mixed" | "tryhard" | "unknown" | null,
    tryhard_playtime: number,
    mixed_playtime: number,
    casual_playtime: number,
    total_playtime: number,
    rank: number,
    ranks: PlayerRanks | null,
    associated_player_id: string | null
}
export interface DetailedPlayerInfo extends DetailedPlayer{
    last_played: string,
    last_played_ended: string | null,
    online_since: string | null,
    last_played_duration: number | null,
}
export type PlayerMostPlayedMap = {
    map: string,
    duration: number,
    rank: number,
}

export type PlayerProfilePicture = {
    id: string,
    full: string,
    medium: string,
}
export type PlayerRegionTime = {
    id: number,
    name: string,
    duration: number,
}
export type PlayersStatistic ={
    total_cum_playtime: number,
    total_players: number,
    countries: number
}
export type ServerPlayersStatistic = {
    all_time: PlayersStatistic,
    week1: PlayersStatistic,
}

export type PlayerSession = {
    id: string,
    server_id: string,
    player_id: string,
    started_at: string,
    ended_at: string | null,
}
export type PlayerSessionPage = {
    total_pages: number,
    rows: PlayerSession[]
}
/** A session from the cross-server list, which has to say which server it happened on. */
export type GlobalPlayerSession = {
    id: string,
    player_id: string,
    server_id: string,
    server_name: string | null,
    community_name: string | null,
    community_icon_url: string | null,
    started_at: string,
    ended_at: string | null,
}
export type GlobalPlayerSessionPage = {
    total_pages: number,
    rows: GlobalPlayerSession[]
}
export type PlayerDetailSession = {
    id: string,
    session_id: string,
    name: string,
    started_at: string,
    ended_at: string | null,
}

export type PlayerDetailSessionCommunity = {
    player_detail: PlayerDetailSession,
    server_id: string,
}

export type PlayerWithLegacyRanks = {
    steamid64: String,
    points: number,
    human_time: number,
    zombie_time: number,
    zombie_killed: number,
    headshot: number,
    infected_time: number,
    item_usage: number,
    boss_killed: number,
    leader_count: number,
    td_count: number,
    rank_total_playtime: number,
    rank_points: number,
    rank_human_time: number,
    rank_zombie_time: number,
    rank_zombie_killed: number,
    rank_headshot: number,
    rank_infected_time: number,
    rank_item_usageContinentStatistics: number,
    rank_boss_killed: number,
    rank_leader_count: number,
    rank_td_count: number,
}

export type PlayerSeen = {
    id: string,
    name: string,
    total_time_together: number,
    last_seen: string,
}


export interface ContinentStatistic {
    name: string;
    count: number;
}

export interface ContinentStatistics {
    contain_countries: number;
    total_count: number;
    continents: ContinentStatistic[];
}

export interface CountryStatistic{
    code: string,
    name: string,
    count: number
}
export type Region = {
    region_name: string,
    region_id: number,
    start_time: string,
    end_time: string,
}

export type SearchPlayer = {
    name: string,
    id: string
}

export type PlayerCommunityPlaytime = {
    community_id: string,
    community_name: string,
    icon_url: string | null,
    total_playtime: number,
}

export interface GlobalPlayerBrief {
    id: string,
    name: string,
    total_playtime: number,
    rank: number,
    online_since: string | null,
    last_played: string,
    last_community_id: string | null,
    server_count: number,
    game: string | null,
}

export type GlobalBriefPlayers = {
    total_players: number,
    players: GlobalPlayerBrief[],
}