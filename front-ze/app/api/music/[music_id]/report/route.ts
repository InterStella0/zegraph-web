import { NextResponse } from "next/server";
import { ReportMapMusicDto } from "types/maps";
import { proxyToBackendChange } from "lib/apiProxy";

// POST /api/music/[music_id]/report
export async function POST(
    req: Request,
    context: { params: Promise<{ music_id: string }> }
) {
    try {
        const { music_id } = await context.params;

        // Parse body
        const body: ReportMapMusicDto = await req.json();

        if (!body.reason) {
            return NextResponse.json(
                { msg: "Report reason is required", data: null },
                { status: 400 }
            );
        }

        if (!['video_unavailable', 'wrong_video'].includes(body.reason)) {
            return NextResponse.json(
                { msg: "Invalid reason", data: null },
                { status: 400 }
            );
        }

        return await proxyToBackendChange<ReportMapMusicDto>(
            `/music/${music_id}/report`,
            body
        );
    } catch (error) {
        console.error('Error submitting music report:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
