import {headers} from "next/headers";
import {auth} from "../auth";
import {BACKEND_DOMAIN} from "utils/generalUtils";

export type ViewKind = 'players' | 'maps'

const VIEW_TIMEOUT_MS = 3000

const isPrefetch = (incoming: Headers) => incoming.has('next-router-prefetch')
    || incoming.get('sec-purpose')?.includes('prefetch') === true
    || incoming.get('purpose') === 'prefetch'

/**
 * Records a page view and resolves to the page's view count, or null when it could not be had.
 * Server-only: it calls the backend directly with VIEW_COUNTER_SECRET, which never reaches the
 * browser, and nginx refuses /data/api/views/ so a browser cannot record views itself.
 *
 * The visitor's IP is x-real-ip alone. nginx overwrites that header, whereas x-forwarded-for keeps
 * whatever the client sent in front of it and so cannot be trusted for deduplication.
 */
export async function recordView(kind: ViewKind, id: string): Promise<number | null> {
    const secret = process.env.VIEW_COUNTER_SECRET
    if (!secret) return null
    try {
        const incoming = await headers()
        if (isPrefetch(incoming)) return null

        const session = await auth()
        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-View-Secret': secret,
            ...(session?.backendJwt && {Authorization: `Bearer ${session.backendJwt}`}),
        }

        const response = await fetch(`${BACKEND_DOMAIN}/views/${kind}/${encodeURIComponent(id)}`, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify({
                ip: incoming.get('x-real-ip') ?? '',
                user_agent: incoming.get('user-agent') ?? '',
            }),
            cache: 'no-store',
            signal: AbortSignal.timeout(VIEW_TIMEOUT_MS),
        })
        if (!response.ok) return null
        const body = await response.json()
        return body?.code === 0 ? body.data.views : null
    } catch {
        return null
    }
}
