// Report status types
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

// Guide report for admin view
export interface GuideReportAdmin {
  id: string;
  guide_id: string;
  guide_title: string | null;
  guide_map_name: string | null;
  guide_author_id: string | null;
  guide_author_name: string | null;
  reporter_id: string;
  reporter_name: string | null;
  reason: string;
  details: string;
  status: ReportStatus;
  resolved_by: string | null;
  resolver_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

// Comment report for admin view
export interface CommentReportAdmin {
  id: string;
  comment_id: string;
  comment_content: string | null;
  comment_author_id: string | null;
  comment_author_name: string | null;
  guide_id: string | null;
  reporter_id: string;
  reporter_name: string | null;
  reason: string;
  details: string;
  status: ReportStatus;
  resolved_by: string | null;
  resolver_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

// Guide ban for admin view
export interface GuideBanAdmin {
  id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  banned_by: string;
  banned_by_name: string | null;
  reason: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
}

// Paginated responses
export interface GuideReportsPaginated {
  total: number;
  reports: GuideReportAdmin[];
}

export interface CommentReportsPaginated {
  total: number;
  reports: CommentReportAdmin[];
}

export interface GuideBansPaginated {
  total: number;
  bans: GuideBanAdmin[];
}

// DTOs for admin actions
export interface UpdateReportStatusDto {
  status: ReportStatus;
}

export interface CreateBanDto {
  reason: string;
  expires_at?: string | null;
}

export interface BanStatus {
  is_banned: boolean;
  reason: string | null;
  expires_at: string | null;
}

// Re-export music report types for admin usage
export type { MapMusicReportAdmin, MapMusicReportsPaginated } from './maps';

// ─── Server nomination request types ──────────────────────────────────────────

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

// ─── Map metadata admin types ─────────────────────────────────────────────────

export interface AdminMapServerEntry {
  server_id: string;
  server_name: string;
  /** null = no override, inherits from global */
  is_tryhard: boolean | null;
  /** null = no override, inherits from global */
  is_casual: boolean | null;
  /** null = no override, inherits from global */
  workshop_id: number | null;
  /** null = no override, inherits from global */
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
  /** null = clear override (inherit from global) */
  is_tryhard: boolean | null;
  /** null = clear override (inherit from global) */
  is_casual: boolean | null;
  /** null = clear override (inherit from global) */
  workshop_id: number | null;
  /** null = clear override (inherit from global) */
  resolved_workshop_id: number | null;
  /** null = keep existing value */
  no_noms: boolean | null;
  /** null = keep existing value */
  min_players: number | null;
  /** null = no player limit */
  max_players: number | null;
}

// ─── Audit log admin types ────────────────────────────────────────────────────

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
