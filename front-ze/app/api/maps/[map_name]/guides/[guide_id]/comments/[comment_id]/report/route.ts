import { NextResponse } from "next/server";
import {ReportDto} from "types/guides";
import { proxyToBackendChange } from "lib/apiProxy";

// POST /api/maps/[map_name]/guides/[guide_id]/comments/[comment_id]/report

export async function POST(
    req: Request,
    context: { params: Promise<{ map_name: string; guide_id: string; comment_id: string }> }
) {
    try {
        const { map_name, guide_id, comment_id } = await context.params;

        const body: ReportDto = await req.json();

        if (!body.reason) {
            return NextResponse.json(
                { msg: "Report reason is required", data: null },
                { status: 400 }
            );
        }

        return await proxyToBackendChange<ReportDto>(
            `/maps/${map_name}/guides/${guide_id}/comments/${comment_id}/report`,
            body,
            "POST"
        );
    } catch (error) {
        console.error('Error updating comment:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}

