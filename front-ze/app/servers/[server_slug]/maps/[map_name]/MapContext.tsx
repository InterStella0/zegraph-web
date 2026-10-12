'use client'
import {createContext, ReactNode, use, useContext, useEffect, useRef, useState} from "react";
import {MapAnalyze, ServerMapDetail} from "types/maps";
import {fetchServerUrl, StillCalculate} from "utils/generalUtils.ts";
import {useServerData} from "../../ServerDataProvider";
import {useNotReadyRetry} from "lib/hooks/useNotReadyRetry";
import {usePeriod} from "components/period/Period";

export const MapContext = createContext<ServerMapDetail>({
    name: "",
    analyze: null,
    notReady: false,
    info: null
})

type PeriodAnalyze = { period: string, analyze: MapAnalyze | null, notReady: boolean };

export function MapContextProvider({ value, children }: { value: Promise<ServerMapDetail>, children: ReactNode }) {
    const initial = use(value)
    const [current, setCurrent] = useState<ServerMapDetail>(initial)
    const [retryTick, setRetryTick] = useState(0)
    const isFirstRun = useRef(true)
    const { server } = useServerData()
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
        if (!server?.id) return
        let cancelled = false
        Promise.all([
            fetchServerUrl(server.id, `/maps/${current.name}/info`),
            fetchServerUrl(server.id, `/maps/${current.name}/analyze`),
        ]).then(([info, analyze]) => {
            if (cancelled) return
            setCurrent(c => ({ ...c, info, analyze, notReady: false }))
        }).catch(() => {})
        return () => { cancelled = true }
    }, [retryTick]);

    useEffect(() => {
        if (!period || !server?.id) return
        let cancelled = false
        fetchServerUrl(server.id, `/maps/${current.name}/analyze`, { params: { period } })
            .then((analyze: MapAnalyze) => {
                if (!cancelled) setPeriodAnalyze({ period, analyze, notReady: false })
            })
            .catch(err => {
                if (!cancelled) setPeriodAnalyze({ period, analyze: null, notReady: err instanceof StillCalculate })
            })
        return () => { cancelled = true }
    }, [server?.id, current.name, period, periodRetryTick]);

    const shown = period
        ? { ...current, analyze: shownPeriod?.analyze ?? null, notReady: !!shownPeriod?.notReady }
        : current

    return <MapContext.Provider value={shown}>{children}</MapContext.Provider>;
}

export function useMapContext() {
    return useContext<ServerMapDetail>(MapContext);
}
