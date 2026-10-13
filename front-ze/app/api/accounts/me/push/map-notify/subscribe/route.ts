import {proxyToBackendChange} from "lib/apiProxy";

export async function POST(req: Request) {
    const body = await req.json()
    return await proxyToBackendChange("/accounts/me/push/map-notify/subscribe", body)
}
