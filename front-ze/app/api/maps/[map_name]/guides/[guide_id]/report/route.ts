import { NextResponse } from "next/server";
import { ReportDto } from "types/guides";
import {proxyToBackendChange} from "lib/apiProxy.ts";

// POST /api/maps/[map_name]/guides/[guide_id]/report
export async function POST(
    req: Request,
    context: { params: Promise<{ map_name: string; guide_id: string }> }
) {
    try {
        const { guide_id, map_name } = await context.params;

        // Parse body
        const body: ReportDto = await req.json();

        if (!body.reason) {
            return NextResponse.json(
                { msg: "Report reason is required", data: null },
                { status: 400 }
            );
        }

        return await proxyToBackendChange<ReportDto>(`/maps/${map_name}/guides/${guide_id}/report`, body)
    } catch (error) {
        console.error('Error submitting report:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
