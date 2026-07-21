import { NextResponse } from "next/server";
import { UpdateGuideDto } from "types/guides";
import {proxyToBackend, proxyToBackendChange} from "lib/apiProxy.ts";

// GET /api/servers/[server_id]/maps/[map_name]/guides/[guide_id]
export async function GET(
    req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string }> }
) {
    try {
        const { map_name, guide_id } = await context.params;
        return await proxyToBackend(`/maps/${map_name}/guides/${guide_id}`, req)
    } catch (error) {
        console.error('Error fetching guide:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}

// PUT /api/servers/[server_id]/maps/[map_name]/guides/[guide_id]
export async function PUT(
    req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string }> }
) {
    try {
        const { guide_id, map_name, server_id } = await context.params;

        const body = await req.json();
        body.server_id = server_id
        return await proxyToBackendChange<UpdateGuideDto>(`/maps/${map_name}/guides/${guide_id}`, body, "PUT")
    } catch (error) {
        console.error('Error updating guide:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}

// DELETE /api/servers/[server_id]/maps/[map_name]/guides/[guide_id]
export async function DELETE(
    _req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string }> }
) {
    try {
        const { guide_id, map_name } = await context.params;
        return await proxyToBackendChange(`/maps/${map_name}/guides/${guide_id}`, null, "DELETE")
    } catch (error) {
        console.error('Error updating guide:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
