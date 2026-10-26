import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { BACKEND_DOMAIN } from "utils/generalUtils";
import { jsonError } from "lib/apiProxy";

/** Unlike the generic proxy, this needs a session and relays the backend JSON for any status. */
async function forwardAnonymize(build: (authorization: string) => Promise<[string, RequestInit]>) {
    const session = await auth();
    if (!session) return jsonError("Unauthorized", 401);

    try {
        const [path, init] = await build(`Bearer ${session.backendJwt}`);
        const backendResponse = await fetch(new URL(BACKEND_DOMAIN + path).toString(), { ...init, cache: "no-store" });
        return NextResponse.json(await backendResponse.json(), { status: backendResponse.status });
    } catch (error) {
        console.error("Error calling backend anonymize endpoint:", error);
        return jsonError("Internal server error", 500);
    }
}

export const GET = () => forwardAnonymize(async authorization => ['/accounts/me/anonymize', {
    method: "GET",
    headers: { "Authorization": authorization },
}]);

export const POST = (req: Request) => forwardAnonymize(async authorization => {
    const { community_id, anonymize, hide_location, user_id } = await req.json();

    const target = user_id ? encodeURIComponent(String(user_id)) : 'me';
    return [`/accounts/${target}/anonymize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": authorization },
        body: JSON.stringify({ community_id, anonymize, hide_location }),
    }];
});
