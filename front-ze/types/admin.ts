export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

export type { MapMusicReportAdmin, MapMusicReportsPaginated } from './maps';

export type ServerRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ServerEntryRequest {
  ip: string;
  port: number;
  readable_link: string;
}

export interface ServerRequestAdmin {
  id: string;
  user_id: string;
  submitter_name: string | null;
  community_name: string;
  icon_url: string | null;
  servers: ServerEntryRequest[];
  game_type: 'cs2' | 'csgo';
  elaboration: string | null;
  status: ServerRequestStatus;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ServerRequestsPaginated {
  total: number;
  requests: ServerRequestAdmin[];
}

export interface AdminMapServerEntry {
  server_id: string;
  server_name: string;
  is_tryhard: boolean | null;
  is_casual: boolean | null;
  workshop_id: number | null;
  resolved_workshop_id: number | null;
  no_noms: boolean;
  min_players: number | null;
  max_players: number | null;
}

export interface AdminMapEntry {
  map_name: string;
  global_is_tryhard: boolean | null;
  global_is_casual: boolean | null;
  global_has_lasers: boolean | null;
  global_workshop_id: number | null;
  global_resolved_workshop_id: number | null;
  servers: AdminMapServerEntry[];
}

export interface AdminMapMetadataResponse {
  total: number;
  maps: AdminMapEntry[];
}

export interface UpdateGlobalMapMetadataDto {
  map_name: string;
  is_tryhard: boolean | null;
  is_casual: boolean | null;
  has_lasers: boolean | null;
  workshop_id: number | null;
  resolved_workshop_id: number | null;
}

export interface UpdateServerMapMetadataDto {
  server_id: string;
  map_name: string;
  is_tryhard: boolean | null;
  is_casual: boolean | null;
  workshop_id: number | null;
  resolved_workshop_id: number | null;
  no_noms: boolean | null;
  min_players: number | null;
  max_players: number | null;
}

export type AuditLogAction = 'update_global' | 'update_server' | 'delete_map';

export interface AuditFieldChange {
  field: string;
  old_value: string | null;
  new_value: string | null;
}

export interface AuditLogEntry {
  id: number;
  category: string;
  action: AuditLogAction | string;
  map_name: string | null;
  server_id: string | null;
  server_name: string | null;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  changes: AuditFieldChange[];
  created_at: string;
}

export interface AuditLogsResponse {
  total: number;
  logs: AuditLogEntry[];
}

export type PlayerClaimStatus = 'pending' | 'approved' | 'rejected';

export interface PlayerClaimAdmin {
  id: string;
  user_id: string;
  claimer_name: string | null;
  player_id: string;
  player_name: string | null;
  server_id: string;
  server_name: string | null;
  note: string | null;
  status: PlayerClaimStatus;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface PlayerClaimsPaginated {
  total: number;
  claims: PlayerClaimAdmin[];
}
