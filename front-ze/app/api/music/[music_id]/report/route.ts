import { NextResponse } from "next/server";
import { ReportMapMusicDto } from "types/maps";
import { proxyToBackendChange } from "lib/apiProxy";

const REASONS = ['video_unavailable', 'wrong_video'];

const reject = (msg: string, status: number) => NextResponse.json({ msg, data: null }, { status });

export async function POST(req: Request, context: { params: Promise<{ music_id: string }> }) {
    try {
        const { music_id } = await context.params;
        const body: ReportMapMusicDto = await req.json();
        if (!body.reason) return reject("Report reason is required", 400);
        if (!REASONS.includes(body.reason)) return reject("Invalid reason", 400);
        return await proxyToBackendChange(`/music/${music_id}/report`, body);
    } catch (error) {
        console.error('Error submitting music report:', error);
        return reject("Internal server error", 500);
    }
}
