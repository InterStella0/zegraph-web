import { proxyToBackend } from "lib/apiProxy";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ server_id: string }> }
) {
    const { server_id } = await params;
    return await proxyToBackend(`/servers/${server_id}/players/autocomplete`, req);
}
