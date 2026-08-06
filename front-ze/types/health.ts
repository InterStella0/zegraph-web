// Mirrors the structs behind GET /health in src/routers/misc.rs. Every Option<T> there is T | null
// here, and null consistently means *unknown* rather than zero — an unreachable redis says nothing
// about how much work is queued.

export interface DependencyHealth {
    /** "up" | "down" */
    status: string;
    latency_ms: number | null;
    error: string | null;
}

export interface QgisHealth {
    status: string;
    latency_ms: number | null;
    error: string | null;
    /** Probed only once the FastCGI port answers, and null when QGIS_WMS_URL is unset. */
    wms: DependencyHealth | null;
}

export interface QueueHealth {
    /** Depth right now — near-always 0, since BRPOP hands a job straight to a waiting consumer. */
    heavy: number | null;
    light: number | null;
    /** Cumulative jobs finished since the counters started; these are what actually climb. */
    completed_heavy: number | null;
    completed_light: number | null;
}

export interface EndpointStat {
    /** A route pattern, never a raw path — e.g. "GET /servers/{server_id}/maps". */
    endpoint: string;
    /** Cumulative, matching TrafficHealth.served — this is what the list is ranked by. */
    served: number;
    /**
     * Mean over the last 5 minutes, falling back to the cumulative mean for an endpoint that served
     * nothing in that window. Never null: the fallback is what stands in for "no data", since a 0
     * would read as "instant".
     */
    average_ms: number;
}

/** Counts are cumulative; the averages are not — see EndpointStat.average_ms. */
export interface TrafficHealth {
    served: number;
    /** Mean over the last 5 minutes across all endpoints, cumulative mean if that window is empty. */
    average_ms: number;
    /** Unix seconds at which the counters started; null before the first flush. Covers `served`
     *  only — the averages have their own, much shorter window. */
    since: number | null;
    busiest: EndpointStat[];
}

export interface ApiHealth {
    /** "ok" | "degraded" */
    response: string;
    postgres: DependencyHealth;
    redis: DependencyHealth;
    queues: QueueHealth;
    qgis: QgisHealth;
    /** null when redis is unreachable — the counters live there. */
    traffic: TrafficHealth | null;
}
