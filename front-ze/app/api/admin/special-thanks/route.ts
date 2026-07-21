import { proxyToBackend, proxyToBackendChange } from "lib/apiProxy";

export async function GET(req: Request) {
  return await proxyToBackend("/special-thanks", req);
}

export async function POST(req: Request) {
  const body = await req.json();
  return await proxyToBackendChange("/special-thanks", body, "POST");
}
