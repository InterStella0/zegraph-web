import { NextResponse } from "next/server";
import { auth } from "auth";
import { CreateGuideDto } from "types/guides";
import {proxyToBackend, proxyToBackendChange} from "lib/apiProxy.ts";

// GET /api/maps/[map_name]/guides
// Query params: page, category, sort
export async function GET(
    req: Request,
    context: { params: Promise<{ map_name: string }> }
) {
    try {
        const { map_name } = await context.params;
        return await proxyToBackend(`/maps/${map_name}/guides`, req)
    } catch (error) {
        console.error('Error fetching guides:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}

// POST /api/maps/[map_name]/guides
export async function POST(
    req: Request,
    context: { params: Promise<{ server_id: string; map_name: string }> }
) {
    try {
        const { map_name } = await context.params;
        const session = await auth();

        if (!session?.user) {
            return NextResponse.json(
                { msg: "Unauthorized. Please log in to create guides.", data: null },
                { status: 401 }
            );
        }

        const body: CreateGuideDto = await req.json();

        if (!body.title || body.title.length < 5 || body.title.length > 200) {
            return NextResponse.json(
                { msg: "Title must be between 5 and 200 characters", data: null },
                { status: 400 }
            );
        }

        if (!body.content || body.content.length < 50) {
            return NextResponse.json(
                { msg: "Content must be at least 50 characters", data: null },
                { status: 400 }
            );
        }

        if (!body.category) {
            return NextResponse.json(
                { msg: "Category is required", data: null },
                { status: 400 }
            );
        }
        return await proxyToBackendChange<CreateGuideDto>(`/maps/${map_name}/guides`, body)
    } catch (error) {
        console.error('Error creating guide:', error);
        return NextResponse.json(
            { msg: "Internal server error", data: null },
            { status: 500 }
        );
    }
}
