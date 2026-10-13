import { proxyToBackend } from "lib/apiProxy";

export async function GET(req: Request) {
    return proxyToBackend("/admin/reports/music", req);
}
