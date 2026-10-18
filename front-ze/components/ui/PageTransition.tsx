'use client'
/// <reference types="react/canary" />
import { ViewTransition, type ReactNode } from "react";

export default function PageTransition({ children }: { children: ReactNode }) {
    return (
        <ViewTransition enter="page-enter" exit="page-exit" update="none" default="none">
            {children}
        </ViewTransition>
    );
}
