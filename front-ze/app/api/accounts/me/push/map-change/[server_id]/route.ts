
import {proxyToBackendChange} from "lib/apiProxy.ts";

export async function DELETE(_req: Request, context: { params: Promise<{ server_id: string }> }) {
    const { server_id } = await context.params
    return await proxyToBackendChange(`/accounts/me/push/map-change/${server_id}`, null, "DELETE");
}