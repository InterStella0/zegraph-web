import { proxyToBackend } from "lib/apiProxy";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ user_id: string }> }
) {
    const { user_id } = await params;
    return await proxyToBackend(`/accounts/${user_id}/playtime-heatmap`, req);
}
