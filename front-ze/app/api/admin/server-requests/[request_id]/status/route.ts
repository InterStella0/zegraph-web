import { proxyToBackendChange } from "lib/apiProxy";

// PUT /api/admin/server-requests/[request_id]/status
export async function PUT(req: Request, context: { params: Promise<{ request_id: string }> }) {
    const { request_id } = await context.params;
    const body = await req.json()
    return await proxyToBackendChange(
        `/admin/server-requests/${request_id}/status`,
        body,
        "PUT"
    );
}
