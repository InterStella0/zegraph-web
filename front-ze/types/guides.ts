// Guide categories
export const GuideCategory = {
  BOSS_STRATEGY: "Boss Strategy",
  ITEM: "Items",
  SHORTCUTS: "Shortcuts",
  TRIGGER: "Triggers",
  BEGINNER_TIPS: "Beginner Tips",
  GENERAL: "General"
} as const;

export type GuideCategoryType = typeof GuideCategory[keyof typeof GuideCategory];

// Author information
export interface GuideAuthor {
  id: string;
  name: string;
  avatar?: string | null;
}

// Vote types
export type VoteType = 'UpVote' | 'DownVote';

// Main guide type
export interface Guide {
  id: string;
  map_name: string;
  server_id: string;
  title: string;
  content: string; // Markdown content
  category: GuideCategoryType;
  author: GuideAuthor;
  created_at: string;
  updated_at: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  slug: string;
  user_vote?: VoteType | null; // Current user's vote (if authenticated)
}

// Comment type (flat structure)
export interface GuideComment {
  id: string;
  guide_id: string;
  author: GuideAuthor;
  content: string; // Plain text or simple markdown
  created_at: string;
  updated_at: string;
  upvotes: number;
  downvotes: number;
  user_vote?: VoteType | null;
}

// Paginated responses
export interface GuidesPaginated {
  total_guides: number;
  guides: Guide[];
}

export interface CommentsPaginated {
  total_comments: number;
  comments: GuideComment[];
}

// Create/update DTOs
export interface CreateGuideDto {
  title: string;
  content: string;
  category: GuideCategoryType;
  server_id?: string | null;
}

export interface UpdateGuideDto {
  title?: string;
  content?: string;
  category?: GuideCategoryType;
  server_id?: string | null;
}

export interface CreateUpdateCommentDto {
  content: string;
}

export interface VoteDto {
  vote_type: VoteType;
}

export interface ReportDto {
  reason: string;
  details?: string;
}

// Sorting options
export type GuideSortType = 'TopRated' | 'Newest' | 'Oldest' | 'MostDiscussed';
