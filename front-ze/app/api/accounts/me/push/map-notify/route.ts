import { proxyToBackend } from "lib/apiProxy";

export async function GET(req: Request) {
    return await proxyToBackend("/accounts/me/push/map-notify", req);
}
