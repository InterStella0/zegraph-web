import type {Dayjs} from "lib/dayjs";
import type {DateSources} from "components/graphs/DateStateManager";

export interface DateState {
    start: Dayjs,
    end: Dayjs,
    source: DateSources,
    timestamp: Dayjs,
    isLive: boolean
}

export interface DateStateProvider extends DateState {
    setDates(start: Dayjs, end: Dayjs, source: DateSources): void;
    goLive(): void;
}
