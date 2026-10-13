import { proxyGet, proxyPost, proxyToBackendChange } from "lib/apiProxy";

const browserPath = (req: Request) => {
  const url = new URL(req.url);
  const ip = url.searchParams.get("ip") ?? "";
  const port = url.searchParams.get("port") ?? "";
  return `/admin/server-browsers?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`;
};

export const GET = proxyGet("/admin/server-browsers");
export const POST = proxyPost("/admin/server-browsers");

export async function PUT(req: Request) {
  return await proxyToBackendChange(browserPath(req), await req.json(), "PUT");
}

export async function DELETE(req: Request) {
  return await proxyToBackendChange(browserPath(req), null, "DELETE");
}
