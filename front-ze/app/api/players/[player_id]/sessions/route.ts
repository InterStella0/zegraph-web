import { proxyToBackend } from "lib/apiProxy";

// Deliberately no cache preset: the response varies by requester. `player_id` can be the literal
// "me", and owners see communities they anonymized while others do not — a shared CDN entry would
// serve one user's history to the next visitor.
export async function GET(
    req: Request,
    { params }: { params: Promise<{ player_id: string }> }
) {
    const { player_id } = await params;
    return await proxyToBackend(`/players/${player_id}/sessions`, req);
}
