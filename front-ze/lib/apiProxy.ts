import {NextResponse} from "next/server";
import { auth } from "../auth";
import { BACKEND_DOMAIN } from "utils/generalUtils";
import { CACHE_HEADERS, withCacheHeaders } from './cacheHeaders';

export async function proxyToBackend(
    endpoint: string,
    req?: Request,
    addParams?: Record<string, string>,
    cachePreset?: keyof typeof CACHE_HEADERS,
    timeoutMs: number = 55_000
) {
    const session = await auth();

    const backendUrl = new URL(BACKEND_DOMAIN + endpoint);

    if (req) {
        const url = new URL(req.url);
        url.searchParams.forEach((value, key) => {
            backendUrl.searchParams.set(key, value);
        });
    }
    if (addParams){
        for(const [key, value] of Object.entries(addParams)){
            backendUrl.searchParams.set(key, value)
        }
    }

    const headers: HeadersInit = { "Content-Type": "application/json" };
    // @ts-ignore
    if (session?.backendJwt) {
        // @ts-ignore
        headers["Authorization"] = `Bearer ${session.backendJwt}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const backendResponse = await fetch(backendUrl.toString(), {
            headers,
            signal: controller.signal,
        });

        let response: Response;
        let code: number | undefined;
        let isStale = false;
        if (backendResponse.ok){
            const data = await backendResponse.json();
            code = data?.code;
            isStale = data?.data?.is_stale === true;
            response = NextResponse.json(data, { status: backendResponse.status });
        }else{
            const data = await backendResponse.text();
            response = NextResponse.json(data, { status: backendResponse.status });
        }

        if (cachePreset) {
            const cacheable = code === 0 && !isStale;
            return withCacheHeaders(response, cacheable ? cachePreset : 'NO_CACHE');
        }

        return response;
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


export async function proxyToBackendChange<T>(
    endpoint: string, payload?: T | null, method: "POST" | "PUT" | "DELETE" = "POST",
    searchParams: Record<string, any> = undefined, timeoutMs: number = 55000
){
    const session = await auth()
    const addition = searchParams? `?${new URLSearchParams(searchParams).toString()}`: ''
    const backendUrl = new URL(BACKEND_DOMAIN + endpoint + addition)
    const headers = {"Content-Type": "application/json"}
    if(session){
        // @ts-ignore
        headers['Authorization'] = `Bearer ${session?.backendJwt}`
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    let body = payload && JSON.stringify(payload)
    try {
        const backendResponse = await fetch(backendUrl.toString(), {
            method,
            headers,
            cache: "no-store",
            body,
            signal: controller.signal,
        });
        if (backendResponse.ok){
            const data = await backendResponse.json();
            return NextResponse.json(data, { status: backendResponse.status });
        }else{
            const data = await backendResponse.text();
            return NextResponse.json(data, { status: backendResponse.status });
        }
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
