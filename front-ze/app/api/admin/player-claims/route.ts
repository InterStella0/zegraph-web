import { proxyToBackend } from "lib/apiProxy";

// GET /api/admin/player-claims
export async function GET(req: Request) {
    return await proxyToBackend("/admin/player-claims", req);
}
