import { proxyToBackend } from "lib/apiProxy";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ server_id: string; player_id: string }> }
) {
    const { server_id, player_id } = await params;
    return await proxyToBackend(`/servers/${server_id}/players/${player_id}/sessions`, req, {}, 'HISTORICAL');
}
