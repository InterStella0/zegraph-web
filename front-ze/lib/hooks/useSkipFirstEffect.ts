'use client'
import {DependencyList, EffectCallback, useEffect, useRef} from 'react';

/**
 * Like useEffect, but skips the first run. For effects that re-fetch data
 * already seeded from a server-provided promise (via `use()`), so the
 * client doesn't immediately refetch what it was just given.
 */
export function useSkipFirstEffect(effect: EffectCallback, deps: DependencyList) {
    const isFirstRun = useRef(true);
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        return effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
