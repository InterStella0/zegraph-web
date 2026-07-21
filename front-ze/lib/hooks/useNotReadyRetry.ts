'use client'
import { useEffect, useRef } from "react";

const INITIAL_RETRY_MS = 8_000;
const STEADY_RETRY_MS = 60_000;

export function useNotReadyRetry(notReady: boolean, retry: () => void) {
    const retryRef = useRef(retry);
    retryRef.current = retry;
    const retriedOnceRef = useRef(false);

    useEffect(() => {
        if (!notReady) {
            retriedOnceRef.current = false;
            return;
        }
        const delay = retriedOnceRef.current ? STEADY_RETRY_MS : INITIAL_RETRY_MS;
        const timer = setTimeout(() => {
            retriedOnceRef.current = true;
            retryRef.current();
        }, delay);
        return () => clearTimeout(timer);
    }, [notReady]);
}
