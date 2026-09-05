import { proxyToBackendChange } from "lib/apiProxy";

// PUT /api/admin/players/[player_id]/associated
export async function PUT(req: Request, context: { params: Promise<{ player_id: string }> }) {
    const { player_id } = await context.params;
    const body = await req.json();
    return await proxyToBackendChange(`/admin/players/${player_id}/associated`, body, "PUT");
}
