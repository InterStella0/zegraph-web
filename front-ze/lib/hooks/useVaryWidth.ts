import {useHydrated} from "./useHydrated";

/**
 * Sizes for skeleton placeholders, varied like real content. The server and hydration render use a fixed per-index
 * value so the HTML matches; after hydration every value is random in [base, base + spread).
 */
export function useVaried() {
    const hydrated = useHydrated();
    return (index: number, base: number, spread: number, step: number) =>
        base + (hydrated ? Math.random() * spread : (index * step) % spread);
}

/** {@link useVaried} as a rem width style for skeleton lines. */
export function useVaryWidth() {
    const vary = useVaried();
    return (index: number, base = 5, spread = 6, step = 3) => ({width: `${vary(index, base, spread, step)}rem`});
}
