'use client'
import {createContext, ReactNode, use, useContext, useEffect, useState} from "react";
import {ServerMapDetail} from "types/maps";
import {fetchServerUrl} from "utils/generalUtils.ts";
import {useServerData} from "../../ServerDataProvider";
import {useNotReadyRetry} from "lib/hooks/useNotReadyRetry";
import {useSkipFirstEffect} from "lib/hooks/useSkipFirstEffect";

export const MapContext = createContext<ServerMapDetail>({
    name: "",
    analyze: null,
    notReady: false,
    info: null
})
export function MapContextProvider({ value, children }: { value: Promise<ServerMapDetail>, children: ReactNode }) {
    const initial = use(value)
    const [current, setCurrent] = useState<ServerMapDetail>(initial)
    const [retryTick, setRetryTick] = useState(0)
    const { server } = useServerData()

    useEffect(() => {
        setCurrent(initial)
    }, [initial])

    useNotReadyRetry(current.notReady, () => setRetryTick(t => t + 1))

    useSkipFirstEffect(() => {
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

    return <MapContext.Provider value={current}>{children}</MapContext.Provider>;
}

export function useMapContext() {
    return useContext<ServerMapDetail>(MapContext);
}