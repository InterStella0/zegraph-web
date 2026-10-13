import {NextResponse} from "next/server";
import { auth } from "../auth";
import { BACKEND_DOMAIN } from "utils/generalUtils";
import { CACHE_HEADERS, withCacheHeaders } from './cacheHeaders';

type CachePreset = keyof typeof CACHE_HEADERS;
type RouteParams = Record<string, string>;
type RouteContext = { params: Promise<RouteParams> };
type RoutePath = string | ((params: RouteParams) => string);

const resolvePath = async (path: RoutePath, context?: RouteContext) =>
    typeof path === 'string' ? path : path(await context.params);

async function withTimeout(endpoint: string, timeoutMs: number, run: (signal: AbortSignal) => Promise<Response>) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await run(controller.signal);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.error("Backend request timed out:", endpoint);
            return NextResponse.json(
                { msg: "Backend request timed out", code: 504 },
                { status: 504 }
            );
        }
        console.error("Error calling backend endpoint:", error);
        return NextResponse.json(
            { msg: "Internal server error", code: 500 },
            { status: 500 }
        );
    } finally {
        clearTimeout(timeoutId);
    }
}

function callBackend(
    endpoint: string,
    backendUrl: URL,
    init: RequestInit,
    timeoutMs: number,
    wrap: (response: NextResponse, data?: any) => Response = response => response
) {
    return withTimeout(endpoint, timeoutMs, async signal => {
        const backendResponse = await fetch(backendUrl.toString(), { ...init, signal });
        if (backendResponse.ok){
            const data = await backendResponse.json();
            return wrap(NextResponse.json(data, { status: backendResponse.status }), data);
        }
        const data = await backendResponse.text();
        return wrap(NextResponse.json(data, { status: backendResponse.status }));
    });
}

export async function proxyToBackend(
    endpoint: string,
    req?: Request,
    addParams?: Record<string, string>,
    cachePreset?: CachePreset,
    timeoutMs: number = 55_000
) {
    const session = await auth();

    const backendUrl = new URL(BACKEND_DOMAIN + endpoint);
    if (req) {
        new URL(req.url).searchParams.forEach((value, key) => backendUrl.searchParams.set(key, value));
    }
    for (const [key, value] of Object.entries(addParams ?? {})) {
        backendUrl.searchParams.set(key, value);
    }

    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (session?.backendJwt) {
        headers["Authorization"] = `Bearer ${session.backendJwt}`;
    }

    return callBackend(endpoint, backendUrl, { headers }, timeoutMs, (response, data) => {
        if (!cachePreset) return response;
        const cacheable = data?.code === 0 && data?.data?.is_stale !== true;
        return withCacheHeaders(response, cacheable ? cachePreset : 'NO_CACHE');
    });
}

export async function proxyToBackendChange<T>(
    endpoint: string, payload?: T | null, method: "POST" | "PUT" | "DELETE" = "POST",
    searchParams: Record<string, any> = undefined, timeoutMs: number = 55000
){
    const session = await auth()
    const addition = searchParams? `?${new URLSearchParams(searchParams).toString()}`: ''
    const backendUrl = new URL(BACKEND_DOMAIN + endpoint + addition)
    const headers = {"Content-Type": "application/json"}
    if(session?.backendJwt){
        headers['Authorization'] = `Bearer ${session.backendJwt}`
    }
    const body = payload == null ? undefined : JSON.stringify(payload)
    return callBackend(endpoint, backendUrl, { method, headers, cache: "no-store", body }, timeoutMs);
}

export async function withJsonBody<T = any>(req: Request, handle: (body: T) => Promise<Response>) {
    let body: T;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ msg: "Invalid JSON body", code: 400 }, { status: 400 });
    }
    return handle(body);
}

export const proxyGet = (path: RoutePath, { cache, query = true }: { cache?: CachePreset, query?: boolean } = {}) =>
    async (req: Request, context: RouteContext) =>
        proxyToBackend(await resolvePath(path, context), query ? req : undefined, {}, cache);

const proxyChange = (method: "POST" | "PUT" | "DELETE") =>
    (path: RoutePath, { body = method !== "DELETE" }: { body?: boolean } = {}) =>
        async (req: Request, context: RouteContext) => {
            const endpoint = await resolvePath(path, context);
            if (!body) return proxyToBackendChange(endpoint, null, method);
            return withJsonBody(req, payload => proxyToBackendChange(endpoint, payload, method));
        };

export const proxyPost = proxyChange("POST");
export const proxyPut = proxyChange("PUT");
export const proxyDelete = proxyChange("DELETE");

export const forwardRaw = (method: "POST" | "DELETE", path: RoutePath, body: 'form' | 'text' | 'none' = 'none', timeoutMs: number = 55_000) =>
    async (req: Request, context: RouteContext) => {
        const endpoint = await resolvePath(path, context);
        const session = await auth();
        if (!session?.backendJwt) {
            return NextResponse.json({ msg: "Unauthorized", code: 401 }, { status: 401 });
        }
        const headers: Record<string, string> = { Authorization: `Bearer ${session.backendJwt}` };
        let payload: BodyInit | undefined;
        if (body === 'form') {
            payload = await req.formData();
        } else if (body === 'text') {
            payload = await req.text();
            headers["Content-Type"] = "application/json";
        }

        return withTimeout(endpoint, timeoutMs, async signal => {
            const response = await fetch(BACKEND_DOMAIN + endpoint, { method, headers, body: payload, signal });
            return new Response(await response.text(), {
                status: response.status,
                headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
            });
        });
    };
