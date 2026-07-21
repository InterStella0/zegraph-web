'use client'
import {ReactNode, useEffect} from "react"

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'

export function PostHogProvider({ children }: { children: ReactNode }) {
    useEffect(() => {
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
            api_host: '/cat',
            enable_heatmaps: true,
            ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
            person_profiles: 'always', // or 'always' to create profiles for anonymous users as well
            defaults: '2025-11-30'
        })
    }, [])

    return (
        <PHProvider client={posthog}>
            {children}
        </PHProvider>
    )
}
