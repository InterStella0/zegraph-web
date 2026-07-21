import { proxyToBackendChange } from "lib/apiProxy";
import type { UpdateReportStatusDto } from "types/admin";

// PUT /api/admin/reports/guides/[report_id]/status
export async function PUT(
    req: Request,
    context: { params: Promise<{ report_id: string }> }
) {
    const { report_id } = await context.params;
    const body: UpdateReportStatusDto = await req.json();
    return await proxyToBackendChange(`/admin/reports/guides/${report_id}/status`, body, "PUT");
}
