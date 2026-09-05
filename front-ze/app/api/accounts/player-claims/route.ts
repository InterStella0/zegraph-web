import { proxyToBackendChange } from "lib/apiProxy";

// POST /api/accounts/player-claims
export async function POST(req: Request) {
    return await proxyToBackendChange("/accounts/player-claims", await req.json());
}
