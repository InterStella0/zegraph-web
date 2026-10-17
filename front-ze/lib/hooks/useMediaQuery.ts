import {useCallback, useSyncExternalStore} from "react";

// null on the server and during hydration, where the viewport is unknown: render every variant
// behind its CSS breakpoint until then, and only the matching one afterwards.
export function useMediaQuery(query: string): boolean | null {
    const subscribe = useCallback((onChange: () => void) => {
        const media = window.matchMedia(query);
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, [query]);
    return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => null);
}
