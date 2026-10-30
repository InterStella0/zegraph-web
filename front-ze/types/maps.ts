export type MapImage = {
    map_name: string,
    small: string,
    medium: string,
    large: string,
    extra_large: string,
}

export type ServerMapMatch = {
    time_id: number,
    server_id: string,
    map: string,
    player_count: number,
    started_at: string,
    zombie_score: number | null,
    human_score: number | null,
    occurred_at: string | null,
    estimated_time_end: string | null,
    server_time_end: string | null,
    extend_count: number | null,
}

export type MapInfo = {
    name: string,
    first_occurrence: string,
    cleared_at: string | null,
    is_tryhard: boolean,
    is_casual: boolean,
    has_lasers: boolean,
    current_cooldown: string | null,
    pending_cooldown: boolean,
    map_left: number | null,
    map_left_last_update: string | null,
    nom_available_from: string | null,
    nom_available_until: string | null,
    nom_opens_at: string | null,
    nom_closes_at: string | null,
    no_noms: boolean,
    enabled: boolean,
    min_players: number,
    max_players: number,
    workshop_id: number,
    creators: string | null,
    file_bytes: number | null,
    removed: boolean,
}
export type MapAnalyze = {
    map: string,
    unique_players: number,
    cum_player_hours: number,
    total_playtime: number,
    total_sessions: number,
    avg_playtime_before_quitting: number,
    dropoff_rate: number,
    last_played: string,
    last_played_ended: string | null,
    avg_players_per_session: number,
}
export type MapDetail<I> = {
    name: string,
    analyze: MapAnalyze | null,
    notReady: boolean,
    info: I | null
}
export type ServerMapDetail = MapDetail<MapInfo>
export interface ServerMap {
    map: string,
    server_id: string,
}

export interface ServerMapPlayed extends ServerMap {
    time_id: number,
    player_count: number,
    started_at: string,
    ended_at: string | null,
}

export type ServerMapPlayedPaginated = {
    total_sessions: number,
    maps: ServerMapPlayed[],
}

export type MapSessionMatch = {
    time_id: number,
    server_id: string,
    zombie_score: number,
    human_score: number,
    occurred_at: string
}
export type MapRegion = {
    region_name: string,
    total_play_duration: number
}
export type DailyMapRegion = {
    date: string,
    regions: MapRegion[]
}
export type MapSessionDistribution = {
    session_range: string,
    session_count: number,
}
export type MapPlayed = {
    map: string,
    first_occurrence: string
    cooldown: string | null,
    pending_cooldown: boolean,
    map_left: number | null,
    map_left_last_update: string | null,
    nom_available_from: string | null,
    nom_available_until: string | null,
    nom_opens_at: string | null,
    nom_closes_at: string | null,
    enabled: boolean,
    is_tryhard: boolean | null,
    is_casual: boolean | null,
    has_lasers: boolean | null,
    is_favorite: boolean | null,
    cleared_at: string | null,
    total_time: number,
    total_sessions: number,
    last_played: string | null,
    last_played_ended: string | null,
    last_session_id: number,
    unique_players: number,
    total_cum_time: number,
    removed: boolean,
    no_noms: boolean,
    min_players: number | null,
    max_players: number | null,
}

export type MapNotifySubscription = {
    id: string;
    map_name: string;
    server_id: string | null;
    created_at: string;
    triggered: boolean;
}
export type MapPlayedPaginated = {
    total_maps: number,
    maps: MapPlayed[]
}

export type GlobalMapServer = {
    server_id: string,
    game: string,
    enabled: boolean,
    removed: boolean,
    cooldown: string | null,
    map_left: number | null,
    nom_opens_at: string | null,
    min_players: number | null,
    is_playing: boolean,
    last_played: string,
    total_time: number,
    total_sessions: number,
    total_cum_time: number,
}

export type GlobalMapPlayed = {
    map: string,
    is_tryhard: boolean,
    is_casual: boolean,
    has_lasers: boolean,
    no_noms: boolean,
    total_time: number,
    total_sessions: number,
    total_cum_time: number,
    unique_players: number,
    last_played: string | null,
    is_playing: boolean,
    is_favorite: boolean | null,
    games: string[],
    servers: GlobalMapServer[],
    image: MapImage | null,
}

export type GlobalMapPaginated = {
    total_maps: number,
    maps: GlobalMapPlayed[]
}

export type GlobalMapInfo = {
    map: GlobalMapPlayed,
    workshop_id: number | null,
    creators: string | null,
    file_bytes: number | null,
}
export type GlobalMapDetail = MapDetail<GlobalMapInfo>

export type MapServerTime = {
    server_id: string,
    map_duration: number,
    player_duration: number,
}
export type DailyMapServer = {
    date: string,
    servers: MapServerTime[],
}


export type MapMusicTrack = {
    id: string;
    title: string;
    artist?: string;
    duration: number;
    contexts: string[];
    youtubeVideoId: string | null;
    otherMaps: string[]
    source: string
    yt_source: string | null
    yt_source_name: string | null
}

export interface ServerMapMusic{
    id: string,
    name: string,
    duration: number,
    youtube_music: string | null,
    source: string,
    tags: string[],
    other_maps: string[],
    yt_source: string | null,
    yt_source_name: string | null
}

export interface ReportMapMusicDto {
  reason: 'video_unavailable' | 'wrong_video';
  details?: string;
  suggested_youtube_url?: string;
}

export interface MapMusicReportAdmin {
  id: string;
  music_id: string;
  music_name: string;
  current_youtube_music: string | null;
  suggested_youtube_url: string | null;
  reporter_id: string;
  reporter_name: string | null;
  reason: string;
  details: string;
  status: 'pending' | 'resolved' | 'dismissed';
  resolved_by: string | null;
  resolver_name: string | null;
  resolved_at: string | null;
  created_at: string;
  music_duration: number;
  music_source: string;
  associated_maps: string[];
}

export interface MapMusicReportsPaginated {
  total: number;
  reports: MapMusicReportAdmin[];
}

export interface UpdateMapMusicDto {
  youtube_music: string | null;
}

export interface Character3DModel {
  id: number
  model_id: string
  name: string | null
  server_id: string
  credit: string | null
  link_path: string
  uploaded_by: number | null
  uploader_name: string | null
  thumbnail_path: string | null
  file_size: number
  created_at: string
  updated_at: string
}