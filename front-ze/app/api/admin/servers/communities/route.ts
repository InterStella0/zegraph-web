import { proxyToBackend, proxyToBackendChange } from "lib/apiProxy";

export async function GET(req: Request) {
  return await proxyToBackend("/admin/communities", req);
}

export async function POST(req: Request) {
  const body = await req.json();
  return await proxyToBackendChange("/admin/communities", body, "POST");
}
