export type AnnouncementType = 'Basic' | 'Rich';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string | null;
  text: string;
  created_at: string;
  published_at: string;
  expires_at: string | null;
  hidden: boolean;
}

export interface AnnouncementsPaginated {
  total: number;
  announcements: Announcement[];
}

export interface CreateAnnouncementDto {
  type: AnnouncementType;
  title: string | null;
  text: string;
  published_at: string | null;
  expires_at: string | null;
  show: boolean;
}

export interface UpdateAnnouncementDto {
  type?: AnnouncementType;
  title?: string | null;
  text?: string;
  published_at?: string | null;
  expires_at?: string | null;
  show?: boolean;
}

export type AnnouncementStatusFilter = 'All' | 'Active' | 'Scheduled' | 'Expired' | 'Hidden';
