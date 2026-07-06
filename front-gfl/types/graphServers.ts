import dayjs from "dayjs";
import type {DateSources} from "components/graphs/DateStateManager";
import {AnnotationOptions} from "chartjs-plugin-annotation/types/options";

export interface DateState {
    start: dayjs.Dayjs,
    end: dayjs.Dayjs,
    source: DateSources,
    timestamp: dayjs.Dayjs,
    isLive: boolean
}

export interface DateStateProvider extends DateState {
    setDates(start: dayjs.Dayjs, end: dayjs.Dayjs, source: DateSources): void;
    goLive(): void;
}

export interface GraphServerState {
    data: {
        playerCounts: number[];
        joinCounts: number[];
        leaveCounts: number[];
        mapAnnotations: AnnotationOptions<"box" | "line">[];
    };
    loading: boolean;
    maxPlayers: number;
}