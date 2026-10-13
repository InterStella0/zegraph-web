import { proxyToBackendChange} from "lib/apiProxy";

// POST /api/accounts/me/push/map-change/subscribe
export async function POST(req: Request) {
    const body: PushSubscriptionJSON = await req.json();
    return await proxyToBackendChange<PushSubscriptionJSON>("/accounts/me/push/subscribe", body);
}
