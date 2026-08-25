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
    wms: DependencyHealth | null;
}

export interface QueueHealth {
    heavy: number | null;
    light: number | null;
    completed_heavy: number | null;
    completed_light: number | null;
}

export interface EndpointStat {
    endpoint: string;
    served: number;
    average_ms: number;
}

export interface TrafficHealth {
    served: number;
    average_ms: number;
    since: number | null;
    busiest: EndpointStat[];
}

export interface AvgGraphPoint {
    timestamp: number;
    value: number | null;
}

export interface ApiHealth {
    /** "ok" | "degraded" */
    response: string;
    postgres: DependencyHealth;
    redis: DependencyHealth;
    queues: QueueHealth;
    qgis: QgisHealth;
    traffic: TrafficHealth | null;
    avg_graph: AvgGraphPoint[] | null;
}
