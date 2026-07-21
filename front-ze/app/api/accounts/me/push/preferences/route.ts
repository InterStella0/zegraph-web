import {proxyToBackend, proxyToBackendChange} from "lib/apiProxy";

export async function GET(req: Request) {
    return await proxyToBackend("/accounts/me/push/preferences", req);
}
export async function PUT(req: Request) {
    const body = await req.json()
    return await proxyToBackendChange("/accounts/me/push/preferences", body, "PUT");
}
