import { proxyToBackend } from "lib/apiProxy";

// GET /api/accounts/player-claims/[server_id]/[player_id]
export async function GET(
    req: Request,
    context: { params: Promise<{ server_id: string, player_id: string }> },
) {
    const { server_id, player_id } = await context.params;
    return await proxyToBackend(`/accounts/player-claims/${server_id}/${player_id}`, req);
}
