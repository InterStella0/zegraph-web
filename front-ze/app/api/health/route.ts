import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await lookup("backend");
    } catch {
        return NextResponse.json(
            { status: "degraded", reason: "cannot resolve backend" },
            { status: 503, headers: { "cache-control": "no-store" } },
        );
    }

    return NextResponse.json(
        { status: "ok" },
        { headers: { "cache-control": "no-store" } },
    );
}
