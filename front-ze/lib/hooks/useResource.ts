'use client'
import {DependencyList, Dispatch, SetStateAction, useEffect, useRef, useState} from "react";
import {StillCalculate} from "utils/generalUtils";
import {useNotReadyRetry} from "./useNotReadyRetry";

type ResourceOptions<T> = {
    initial?: T,
    skipFirst?: boolean,
    keepData?: boolean,
    keepError?: boolean,
    retryNotReady?: boolean,
    errorLog?: string,
};

export type Resource<T> = {
    data: T | null,
    setData: Dispatch<SetStateAction<T | null>>,
    loading: boolean,
    error: Error | null,
    notReady: boolean,
};

export function useResource<T>(
    fetcher: (signal: AbortSignal) => Promise<T> | null | undefined,
    deps: DependencyList,
    options: ResourceOptions<T> = {},
): Resource<T> {
    const {initial, keepData = false, keepError = false, retryNotReady = false, errorLog} = options;
    const hasInitial = initial !== undefined;
    const [data, setData] = useState<T | null>(initial ?? null);
    const [loading, setLoading] = useState(!hasInitial);
    const [error, setError] = useState<Error | null>(null);
    const [retryTick, setRetryTick] = useState(0);
    const skipFirst = useRef(options.skipFirst ?? hasInitial);
    const notReady = error instanceof StillCalculate;
    useNotReadyRetry(retryNotReady && notReady, () => setRetryTick(t => t + 1));

    useEffect(() => {
        if (skipFirst.current) {
            skipFirst.current = false;
            return;
        }
        const controller = new AbortController();
        const signal = controller.signal;
        const pending = fetcher(signal);
        if (!pending) return;
        setLoading(true);
        if (!keepError) setError(null);
        if (!keepData) setData(null);
        pending
            .then(result => {
                if (signal.aborted) return;
                setData(result);
                setError(null);
            })
            .catch(err => {
                if (signal.aborted) return;
                if (errorLog && !(retryNotReady && err instanceof StillCalculate)) console.error(errorLog, err);
                setError(err);
            })
            .finally(() => {
                if (!signal.aborted) setLoading(false);
            });
        return () => controller.abort("Changed");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, retryTick]);

    return {data, setData, loading, error, notReady};
}
