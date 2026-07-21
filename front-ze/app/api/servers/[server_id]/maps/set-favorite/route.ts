import { NextResponse } from "next/server";
import {auth} from "../../../../../../auth.ts";
import {BACKEND_DOMAIN} from "utils/generalUtils.ts";

export async function POST(req: Request, context: { params: Promise<{ server_id: string }> }) {
    const { server_id } = await context.params;

    const body = await req.json();
    const { map_name } = body;
    const backendUrl = new URL(BACKEND_DOMAIN + `/servers/${server_id}/maps/set-favorite`)
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
        body: JSON.stringify({ map_name }),
    });

    const data = await backendResponse.json();

    return NextResponse.json(data, { status: backendResponse.status });
}