import { CSSProperties } from "react";

export const ENTER = "motion-safe:animate-in fade-in-0 slide-in-from-bottom-3 animation-duration-500 ease-out fill-mode-both";

export const SWAP = "motion-safe:animate-in fade-in-0 slide-in-from-bottom-1 animation-duration-300 ease-out fill-mode-both";

export const LIFT = "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

export const COLLAPSE = "overflow-hidden motion-safe:data-[state=open]:animate-collapsible-down motion-safe:data-[state=closed]:animate-collapsible-up";

export function stagger(index: number, step = 40): CSSProperties {
    return { animationDelay: `${Math.min(index, 10) * step}ms` };
}
