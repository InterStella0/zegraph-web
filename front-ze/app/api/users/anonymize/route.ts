import { NextResponse } from "next/server";
import { auth, SteamSession } from "../../../../auth";
import { BACKEND_DOMAIN } from "utils/generalUtils";

async function forwardAnonymize(build: (session: SteamSession) => Promise<[string, RequestInit]>) {
    const session = await auth();

    if (!session) {
        return NextResponse.json(
            { msg: "Unauthorized", code: 401 },
            { status: 401 }
        );
    }

    try {
        const [path, init] = await build(session);
        const backendResponse = await fetch(new URL(BACKEND_DOMAIN + path).toString(), { ...init, cache: "no-store" });
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

export const GET = () => forwardAnonymize(async session => ['/accounts/me/anonymize', {
    method: "GET",
    headers: { "Authorization": `Bearer ${session?.backendJwt}` },
}]);

export const POST = (req: Request) => forwardAnonymize(async session => {
    const { community_id, anonymize, hide_location, user_id } = await req.json();

    const target = user_id ? encodeURIComponent(String(user_id)) : 'me';
    return [`/accounts/${target}/anonymize`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.backendJwt}`
        },
        body: JSON.stringify({ community_id, anonymize, hide_location }),
    }];
});
