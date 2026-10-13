import { proxyToBackendChange } from "lib/apiProxy";

export async function PUT(req: Request) {
  const body = await req.json();
  return await proxyToBackendChange("/admin/maps/metadata/global", body, "PUT");
}
