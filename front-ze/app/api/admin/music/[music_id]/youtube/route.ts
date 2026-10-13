import { proxyToBackendChange } from "lib/apiProxy";

export async function PUT(
    req: Request,
    context: { params: Promise<{ music_id: string }> }
) {
    const { music_id } = await context.params;
    const body = await req.json();
    return proxyToBackendChange(`/admin/music/${music_id}/youtube`, body, "PUT");
}
