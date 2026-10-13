import { proxyToBackend } from "lib/apiProxy";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ player_id: string }> }
) {
    const { player_id } = await params;
    return await proxyToBackend(`/players/${player_id}/global-playtime`, req);
}
