import dayjs from "lib/dayjs";
import {useHydrated} from "lib/hooks/useHydrated";

// Kept apart from useHydrated so layout-level components that only need the hydration flag
// don't pull every dayjs plugin into the shared first-load chunk.
export function useLocalDayjs() {
    const hydrated = useHydrated();
    return (t?: dayjs.ConfigType) => hydrated ? dayjs(t) : dayjs.utc(t);
}
