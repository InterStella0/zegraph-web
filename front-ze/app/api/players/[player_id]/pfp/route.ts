import { proxyToBackend } from "lib/apiProxy";

export async function GET(
    req: Request,
    context: { params: Promise<{ player_id: string }> }
) {
    const { player_id } = await context.params;
    return await proxyToBackend(`/players/${player_id}/pfp`, req, {}, 'STATIC');
}
