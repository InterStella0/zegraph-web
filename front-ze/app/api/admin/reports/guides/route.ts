import { proxyToBackend } from "lib/apiProxy";

// GET /api/admin/reports/guides
export async function GET(req: Request) {
    return await proxyToBackend("/admin/reports/guides", req);
}
