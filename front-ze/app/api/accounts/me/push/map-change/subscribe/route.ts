
import {proxyToBackendChange} from "lib/apiProxy.ts";
import {CreateMapChangeSubscriptionDto} from "types/notifications.ts";

export async function POST(req: Request) {
    const body: CreateMapChangeSubscriptionDto = await req.json();
    return await proxyToBackendChange<CreateMapChangeSubscriptionDto>("/accounts/me/push/map-change/subscribe", body);
}