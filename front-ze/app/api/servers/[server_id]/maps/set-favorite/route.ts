import { proxyToBackendChange, withJsonBody } from "lib/apiProxy";

export async function POST(req: Request, context: { params: Promise<{ server_id: string }> }) {
    const { server_id } = await context.params;
    return withJsonBody<{ map_name: string }>(req, ({ map_name }) =>
        proxyToBackendChange(`/servers/${server_id}/maps/set-favorite`, { map_name }));
}
