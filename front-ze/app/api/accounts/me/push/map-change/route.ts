import {proxyToBackend} from "../../../../../../lib/apiProxy.ts";

export async function GET(req: Request) {
    return await proxyToBackend("/accounts/me/push/map-change", req);
}