import {NextResponse} from "next/server";
import { auth } from "../auth";
import { BACKEND_DOMAIN } from "utils/generalUtils";
import { type CachePreset, withCacheHeaders } from './cacheHeaders';

type Method = "POST" | "PUT" | "DELETE";
type RouteParams = Record<string, string>;
type RouteContext = { params: Promise<RouteParams> };
type RoutePath = string | ((params: RouteParams) => string);

const TIMEOUT_MS = 55_000;

const resolvePath = async (path: RoutePath, context?: RouteContext) =>
    typeof path === 'string' ? path : path(await context.params);

export const jsonError = (msg: string, code: number) => NextResponse.json({ msg, code }, { status: code });

async function withTimeout(endpoint: string, run: (signal: AbortSignal) => Promise<Response>) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        return await run(controller.signal);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.error("Backend request timed out:", endpoint);
            return jsonError("Backend request timed out", 504);
        }
        console.error("Error calling backend endpoint:", error);
        return jsonError("Internal server error", 500);
    } finally {
        clearTimeout(timeoutId);
    }
}

const passThrough = async (response: Response) =>
    new Response(await response.text(), {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });

/**
 * Calls the backend as the signed-in user. With a cache preset, only a fresh successful payload
 * (`code` 0 and not `is_stale`) is marked cacheable; everything else gets NO_CACHE.
 */
async function callBackend(endpoint: string, params: Record<string, string>, init: RequestInit, cache?: CachePreset) {
    const session = await auth();
    const backendUrl = new URL(BACKEND_DOMAIN + endpoint);
    for (const [key, value] of Object.entries(params)) backendUrl.searchParams.set(key, value);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.backendJwt) headers.Authorization = `Bearer ${session.backendJwt}`;

    return withTimeout(endpoint, async signal => {
        const backendResponse = await fetch(backendUrl.toString(), { ...init, headers, signal });
        const data = backendResponse.ok ? await backendResponse.json() : undefined;
        const response = backendResponse.ok
            ? NextResponse.json(data, { status: backendResponse.status })
            : await passThrough(backendResponse);
        if (!cache) return response;
        const cacheable = data?.code === 0 && data?.data?.is_stale !== true;
        return withCacheHeaders(response, cacheable ? cache : 'NO_CACHE');
    });
}

export function proxyToBackendChange(endpoint: string, payload?: unknown, method: Method = "POST", params: Record<string, string> = {}) {
    const body = payload == null ? undefined : JSON.stringify(payload);
    return callBackend(endpoint, params, { method, cache: "no-store", body });
}

async function withJsonBody(req: Request, handle: (body: unknown) => Promise<Response>) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return jsonError("Invalid JSON body", 400);
    }
    return handle(body);
}

/** `query`: forward the request's query string (default), or not. */
export const proxyGet = (path: RoutePath, { cache, query = true }: { cache?: CachePreset, query?: boolean } = {}) =>
    async (req: Request, context: RouteContext) =>
        callBackend(await resolvePath(path, context), query ? Object.fromEntries(new URL(req.url).searchParams) : {}, {}, cache);

/** `body`: forward the JSON body (default except DELETE). `query`: request query params to forward when non-empty. */
const proxyChange = (method: Method) =>
    (path: RoutePath, { body = method !== "DELETE", query = [] }: { body?: boolean, query?: string[] } = {}) =>
        async (req: Request, context: RouteContext) => {
            const endpoint = await resolvePath(path, context);
            const incoming = new URL(req.url).searchParams;
            const params = Object.fromEntries(query.filter(key => incoming.get(key)).map(key => [key, incoming.get(key)]));
            const send = (payload: unknown) => proxyToBackendChange(endpoint, payload, method, params);
            return body ? withJsonBody(req, send) : send(null);
        };

export const proxyPost = proxyChange("POST");
export const proxyPut = proxyChange("PUT");
export const proxyDelete = proxyChange("DELETE");

/** Forwards the raw request body (multipart form or JSON text) for uploads; requires a signed-in user. */
export const forwardRaw = (method: "POST" | "DELETE", path: RoutePath, body: 'form' | 'text' | 'none' = 'none') =>
    async (req: Request, context: RouteContext) => {
        const endpoint = await resolvePath(path, context);
        const session = await auth();
        if (!session?.backendJwt) return jsonError("Unauthorized", 401);
        const headers: Record<string, string> = { Authorization: `Bearer ${session.backendJwt}` };
        let payload: BodyInit | undefined;
        try {
            if (body === 'form') {
                payload = await req.formData();
            } else if (body === 'text') {
                payload = await req.text();
                headers["Content-Type"] = "application/json";
            }
        } catch {
            return jsonError("Invalid request body", 400);
        }

        return withTimeout(endpoint, async signal =>
            passThrough(await fetch(BACKEND_DOMAIN + endpoint, { method, headers, body: payload, signal })));
    };
