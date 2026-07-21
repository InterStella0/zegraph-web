export interface FetchStatusEntry {
    fetch_id: number;
    server_id: string;
    server_name: string;
    community_id: string;
    community_name: string;
    op_name: string;
    source_name: string;
    fetched_at: string;
    ok: boolean;
    error: string | null;
}

export interface FetchStatusBucket {
    ok: number;
    error: number;
    first_error: string | null;
    bucket_index: number;
}

export interface FetchStatusTrack {
    label: string;
    total_ok: number;
    total_fetches: number;
    buckets: FetchStatusBucket[];
}

export interface FetchStatusServerGroupTruncated {
    server_id: string;
    server_name: string;
    tracks: FetchStatusTrack[];
}

export interface FetchStatusCommunityGroupTruncated {
    community_id: string;
    community_name: string;
    servers: FetchStatusServerGroupTruncated[];
}
