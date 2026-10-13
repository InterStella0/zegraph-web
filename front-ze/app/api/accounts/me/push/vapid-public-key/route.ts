import {proxyToBackend} from "lib/apiProxy";

// GET /api/accounts/me/push/vapid-public-key
export async function GET(_req: Request) {
    return await proxyToBackend("/accounts/me/push/vapid-public-key");
}
