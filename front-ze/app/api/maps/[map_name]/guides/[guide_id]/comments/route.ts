import { NextResponse } from "next/server";
import { CreateUpdateCommentDto } from "types/guides";
import {proxyToBackend, proxyToBackendChange} from "lib/apiProxy.ts";

// GET /api/maps/[map_name]/guides/[guide_id]/comments
export async function GET(
    req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string }> }
) {
    const {map_name, guide_id } = await context.params
    return await proxyToBackend(`/maps/${map_name}/guides/${guide_id}/comments`, req )
}

// POST /api/maps/[map_name]/guides/[guide_id]/comments
export async function POST(
    req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string }> }
) {
    try {
        const { guide_id, map_name } = await context.params;

        // Parse body
        const body: CreateUpdateCommentDto = await req.json();

        // Validation
        if (!body.content || body.content.trim().length === 0) {
            return NextResponse.json(
                { msg: "Comment content is required", data: null },
                { status: 400 }
            );
        }

        if (body.content.length > 2000) {
            return NextResponse.json(
                { msg: "Comment is too long. Maximum 2000 characters.", data: null },
                { status: 400 }
            );
        }

        return await proxyToBackendChange<CreateUpdateCommentDto>(`/maps/${map_name}/guides/${guide_id}/comments`, body)
    } catch (error) {
        console.error('Error creating comment:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
