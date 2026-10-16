import {useSyncExternalStore} from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const subscribe = () => () => {};

export function useHydrated(): boolean {
    return useSyncExternalStore(subscribe, () => true, () => false);
}

export function useLocalDayjs() {
    const hydrated = useHydrated();
    return (t?: dayjs.ConfigType) => hydrated ? dayjs(t) : dayjs.utc(t);
}
