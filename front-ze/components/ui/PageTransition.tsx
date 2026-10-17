'use client'
/// <reference types="react/canary" />
import { ViewTransition, type ReactNode } from "react";

// The default export of every template.tsx. Next remounts a template whenever the segment below it
// changes, and that remount is what fires enter/exit, so a navigation fades the outgoing page out
// and the incoming one in. A template only sees changes one segment down, so every route directory
// with nested pages needs its own. Nested boundaries are fine: React animates the outermost one
// that changed. update="none" keeps search-param changes, Suspense reveals and other in-page
// transitions from animating. The keyframes live in globals.css.
export default function PageTransition({ children }: { children: ReactNode }) {
    return (
        <ViewTransition enter="page-enter" exit="page-exit" update="none" default="none">
            {children}
        </ViewTransition>
    );
}
