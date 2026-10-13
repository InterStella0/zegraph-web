import { proxyToBackend } from "lib/apiProxy";

export async function GET(req: Request, context: { params: Promise<{ server_id: string }> }) {
    const { server_id } = await context.params;
    return await proxyToBackend(`/servers/${server_id}/maps/last/sessions`, req, {}, 'LIVE');
}