import { proxyToBackendChange } from "lib/apiProxy";

export async function POST(req: Request, context: { params: Promise<{ server_id: string }> }) {
    const { server_id } = await context.params;
    const { map_name } = await req.json();
    return proxyToBackendChange(`/servers/${server_id}/maps/set-favorite`, { map_name });
}
