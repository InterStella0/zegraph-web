import { proxyToBackendChange } from "lib/apiProxy";

export async function POST(_req: Request, context: { params: Promise<{ server_id: string, map_name: string }> }) {
    const { server_id, map_name } = await context.params;
    return proxyToBackendChange(`/servers/${server_id}/maps/${map_name}/unset-favorite`);
}
