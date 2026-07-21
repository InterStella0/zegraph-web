import { NextResponse } from "next/server";
import { VoteDto } from "types/guides";
import {proxyToBackendChange} from "lib/apiProxy.ts";

// POST /api/servers/[server_id]/maps/[map_name]/guides/[guide_id]/vote
// Add or change vote
export async function POST(
    req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string }> }
) {
    try {
        const { guide_id, map_name} = await context.params;

        const body: VoteDto = await req.json();

        return await proxyToBackendChange<VoteDto>(`/maps/${map_name}/guides/${guide_id}/vote`, body)
    } catch (error) {
        console.error('Error voting on guide:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}

// DELETE /api/servers/[server_id]/maps/[map_name]/guides/[guide_id]/vote
// Remove vote
export async function DELETE(
    _req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string }> }
) {
    try {
        const { guide_id, map_name } = await context.params;

        return await proxyToBackendChange(`/maps/${map_name}/guides/${guide_id}/vote`, null, "DELETE")
    } catch (error) {
        console.error('Error removing vote:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
