import {RefObject, useLayoutEffect, useState} from "react";

/** How far the element sits from the top of the page, ignoring scroll. */
function pageTop(el: HTMLElement) {
    let top = 0;
    for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
    return top;
}

/**
 * The CSS height that runs `ref` from where it starts down to the bottom of the screen. Whatever sits above it
 * (app bar, banners) varies by page and screen size, so it is measured instead of assumed, and re-measured when
 * the page around it resizes, e.g. a banner being dismissed.
 */
export function useViewportRemainder(ref: RefObject<HTMLElement | null>, fallbackTop: number) {
    const [top, setTop] = useState(fallbackTop);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => setTop(pageTop(el));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [ref]);
    return `calc(100dvh - ${top}px)`;
}
