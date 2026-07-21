import { proxyToBackend } from "lib/apiProxy";

// GET /api/admin/server-requests
export async function GET(req: Request) {
    return await proxyToBackend("/admin/server-requests", req);
}
