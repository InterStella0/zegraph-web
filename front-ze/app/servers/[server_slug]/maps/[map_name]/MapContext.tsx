'use client'
import {createContext, ReactNode, use, useContext, useEffect, useRef, useState} from "react";
import {MapAnalyze, MapDetail, MapInfo} from "types/maps";
import {fetchMapUrl, StillCalculate} from "utils/generalUtils.ts";
import {useServerData} from "../../ServerDataProvider";
import {useNotReadyRetry} from "lib/hooks/useNotReadyRetry";
import {usePeriod} from "components/period/Period";

const EMPTY_MAP: MapDetail<unknown> = {
    name: "",
    analyze: null,
    notReady: false,
    info: null
}

/** Holds a per-server `MapInfo`, or a `GlobalMapInfo` on the global map page. */
export const MapContext = createContext<MapDetail<unknown>>(EMPTY_MAP)

export function EmptyMapContext({ children }: { children: ReactNode }) {
    return <MapContext.Provider value={EMPTY_MAP}>{children}</MapContext.Provider>;
}

type PeriodAnalyze = { period: string, analyze: MapAnalyze | null, notReady: boolean };

export function MapContextProvider<I>({ value, children }: { value: Promise<MapDetail<I>>, children: ReactNode }) {
    const initial = use(value)
    const [current, setCurrent] = useState<MapDetail<I>>(initial)
    const [retryTick, setRetryTick] = useState(0)
    const isFirstRun = useRef(true)
    // Outside the servers layout there is no server, and the map's endpoints span every server.
    const serverId = useServerData()?.server?.id ?? null
    const { period } = usePeriod()
    const [periodAnalyze, setPeriodAnalyze] = useState<PeriodAnalyze | null>(null)
    const [periodRetryTick, setPeriodRetryTick] = useState(0)
    const shownPeriod = period && periodAnalyze?.period === period ? periodAnalyze : null

    useEffect(() => {
        setCurrent(initial)
    }, [initial])

    useNotReadyRetry(current.notReady, () => setRetryTick(t => t + 1))
    useNotReadyRetry(!!shownPeriod?.notReady, () => setPeriodRetryTick(t => t + 1))

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false
            return
        }
        let cancelled = false
        Promise.all([
            fetchMapUrl(serverId, current.name, '/info'),
            fetchMapUrl(serverId, current.name, '/analyze'),
        ]).then(([info, analyze]) => {
            if (cancelled) return
            setCurrent(c => ({ ...c, info, analyze, notReady: false }))
        }).catch(() => {})
        return () => { cancelled = true }
    }, [retryTick]);

    useEffect(() => {
        if (!period) return
        let cancelled = false
        fetchMapUrl(serverId, current.name, '/analyze', { params: { period } })
            .then((analyze: MapAnalyze) => {
                if (!cancelled) setPeriodAnalyze({ period, analyze, notReady: false })
            })
            .catch(err => {
                if (!cancelled) setPeriodAnalyze({ period, analyze: null, notReady: err instanceof StillCalculate })
            })
        return () => { cancelled = true }
    }, [serverId, current.name, period, periodRetryTick]);

    const shown = period
        ? { ...current, analyze: shownPeriod?.analyze ?? null, notReady: !!shownPeriod?.notReady }
        : current

    return <MapContext.Provider value={shown}>{children}</MapContext.Provider>;
}

/** `I` is the info shape the caller expects: `MapInfo` on a server's page, `GlobalMapInfo` globally. */
export function useMapContext<I = MapInfo>() {
    return useContext(MapContext) as MapDetail<I>;
}
