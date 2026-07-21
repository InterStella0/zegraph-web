import { proxyToBackend } from "lib/apiProxy";
import { NextResponse } from "next/server";

export async function GET(
    req: Request,
    context: { params: Promise<{ server_id: string }> }
) {
    try {
        const { server_id } = await context.params;
        return await proxyToBackend(`/servers/${server_id}/guides`, req);
    } catch (error) {
        console.error('Error fetching server guides:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
