import { proxyToBackend } from "lib/apiProxy";
import { NextResponse } from "next/server";

export async function GET(
    req: Request,
    context: { params: Promise<{ server_id: string; guide_slug: string; map_name: string }> }
) {
    try {
        const { guide_slug, map_name } = await context.params;
        return await proxyToBackend(`/maps/${map_name}/guides/slugs/${guide_slug}`, req );
    } catch (error) {
        console.error('Error fetching server guides:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
