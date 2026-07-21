import { proxyToBackendChange} from "../../../../../../../lib/apiProxy.ts";

export async function DELETE(req: Request, context: { params: Promise<{map_name: string}> }) {
    const { map_name } = await context.params;
    const { searchParams } = new URL(req.url);
    const server_id = searchParams.get('server_id');
    const params = server_id? { server_id }: null
    return await proxyToBackendChange(`/accounts/me/push/map-notify/${map_name}`, null, "DELETE", params)
}
