import { proxyToBackendChange } from "lib/apiProxy";

// POST /api/accounts/me/merge
export async function POST(req: Request) {
    return await proxyToBackendChange("/accounts/me/merge", await req.json());
}
