import { proxyToBackendChange } from "lib/apiProxy";

export async function DELETE(req: Request, context: { params: Promise<{map_name: string}> }) {
    const { map_name } = await context.params;
    const server_id = new URL(req.url).searchParams.get('server_id');
    return await proxyToBackendChange(`/accounts/me/push/map-notify/${map_name}`, null, "DELETE", server_id ? { server_id } : null)
}
