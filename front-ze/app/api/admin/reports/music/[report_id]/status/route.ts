import { proxyToBackendChange } from "lib/apiProxy";

export async function PUT(
    req: Request,
    context: { params: Promise<{ report_id: string }> }
) {
    const { report_id } = await context.params;
    const body = await req.json();
    return proxyToBackendChange(`/admin/reports/music/${report_id}/status`, body, "PUT");
}
