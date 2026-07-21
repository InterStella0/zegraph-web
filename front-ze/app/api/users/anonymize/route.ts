import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { BACKEND_DOMAIN } from "utils/generalUtils";

export async function GET() {
    const session = await auth();

    if (!session) {
        return NextResponse.json(
            { msg: "Unauthorized", code: 401 },
            { status: 401 }
        );
    }

    try {
        const backendUrl = new URL(BACKEND_DOMAIN + '/accounts/me/anonymize');
        const headers = {
            // @ts-ignore
            "Authorization": `Bearer ${session?.backendJwt}`
        };

        const backendResponse = await fetch(backendUrl.toString(), {
            method: "GET",
            headers,
            cache: "no-store",
        });

        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });
    } catch (error) {
        console.error("Error calling backend anonymize endpoint:", error);
        return NextResponse.json(
            { msg: "Internal server error", code: 500 },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    const session = await auth();

    if (!session) {
        return NextResponse.json(
            { msg: "Unauthorized", code: 401 },
            { status: 401 }
        );
    }

    try {
        const body = await req.json();
        const { community_id, anonymize, hide_location } = body;

        const backendUrl = new URL(BACKEND_DOMAIN + '/accounts/me/anonymize');
        const headers = {
            "Content-Type": "application/json",
            // @ts-ignore
            "Authorization": `Bearer ${session?.backendJwt}`
        };

        const backendResponse = await fetch(backendUrl.toString(), {
            method: "POST",
            headers,
            cache: "no-store",
            body: JSON.stringify({ community_id, anonymize, hide_location }),
        });

        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });
    } catch (error) {
        console.error("Error calling backend anonymize endpoint:", error);
        return NextResponse.json(
            { msg: "Internal server error", code: 500 },
            { status: 500 }
        );
    }
}
