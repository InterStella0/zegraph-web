import { NextResponse } from "next/server";
import {auth} from "auth";
import {BACKEND_DOMAIN} from "utils/generalUtils.ts";

export async function POST(_req: Request, context: { params: Promise<{ server_id: string, map_name: string }> }) {
    const { server_id, map_name } = await context.params;

    const backendUrl = new URL(BACKEND_DOMAIN + `/servers/${server_id}/maps/${map_name}/unset-favorite`)
    const session = await auth()
    const headers = {"Content-Type": "application/json"}
    if(session){
        // @ts-ignore
        headers['Authorization'] = `Bearer ${session?.backendJwt}`
    }

    const backendResponse = await fetch(backendUrl.toString(), {
        method: "POST",
        headers,
        cache: "no-store",
    });

    const data = await backendResponse.json();

    return NextResponse.json(data, { status: backendResponse.status });
}