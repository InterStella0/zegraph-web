import { proxyToBackendChange } from "lib/apiProxy";

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ server_id: string; player_id: string }> }
) {
    const { server_id, player_id } = await params;
    return await proxyToBackendChange(`/servers/${server_id}/players/${player_id}/might_friends/calculate`);
}
