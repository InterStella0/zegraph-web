import { proxyToBackendChange } from "lib/apiProxy";

// POST /api/server-requests
export async function POST(req: Request) {
    return await proxyToBackendChange("/accounts/server-requests", await req.json());
}
