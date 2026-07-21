import { NextResponse } from "next/server";
import { CreateUpdateCommentDto } from "types/guides";
import { proxyToBackendChange } from "lib/apiProxy";

// PUT /api/servers/[server_id]/maps/[map_name]/guides/[guide_id]/comments/[comment_id]
export async function PUT(
    req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string; comment_id: string }> }
) {
    try {
        const { map_name, guide_id, comment_id } = await context.params;

        const body: CreateUpdateCommentDto = await req.json();

        // Validation
        if (!body.content?.trim()) {
            return NextResponse.json(
                { msg: "Comment content required", data: null },
                { status: 400 }
            );
        }

        if (body.content.length > 2000) {
            return NextResponse.json(
                { msg: "Comment too long (max 2000 characters)", data: null },
                { status: 400 }
            );
        }

        return await proxyToBackendChange<CreateUpdateCommentDto>(
            `/maps/${map_name}/guides/${guide_id}/comments/${comment_id}`,
            body,
            "PUT"
        );
    } catch (error) {
        console.error('Error updating comment:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}

// DELETE /api/servers/[server_id]/maps/[map_name]/guides/[guide_id]/comments/[comment_id]
export async function DELETE(
    _req: Request,
    context: { params: Promise<{ server_id: string; map_name: string; guide_id: string; comment_id: string }> }
) {
    try {
        const { map_name, guide_id, comment_id } = await context.params;

        return await proxyToBackendChange(
            `/maps/${map_name}/guides/${guide_id}/comments/${comment_id}`,
            null,
            "DELETE"
        );
    } catch (error) {
        console.error('Error deleting comment:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
