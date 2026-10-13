import { proxyToBackend } from "lib/apiProxy";

export async function GET(req: Request) {
    return await proxyToBackend("/communities/all/players/playing", req);
}
