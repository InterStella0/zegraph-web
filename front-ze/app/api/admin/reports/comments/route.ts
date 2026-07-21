import { proxyToBackend } from "lib/apiProxy";

// GET /api/admin/reports/comments
export async function GET(req: Request) {
    return await proxyToBackend("/admin/reports/comments", req);
}
