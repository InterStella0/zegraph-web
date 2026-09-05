import { proxyToBackendChange } from "lib/apiProxy";

// PUT /api/admin/player-claims/[claim_id]/status
export async function PUT(req: Request, context: { params: Promise<{ claim_id: string }> }) {
    const { claim_id } = await context.params;
    const body = await req.json();
    return await proxyToBackendChange(`/admin/player-claims/${claim_id}/status`, body, "PUT");
}
