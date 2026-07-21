import { proxyToBackend } from "lib/apiProxy";

// GET /api/admin/bans
export async function GET(req: Request) {
    return await proxyToBackend("/admin/bans", req);
}
