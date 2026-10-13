import { proxyGet, proxyPost, proxyToBackendChange, withJsonBody } from "lib/apiProxy";

const browserParams = (req: Request) => {
  const url = new URL(req.url);
  return {
    ip: url.searchParams.get("ip") ?? "",
    port: url.searchParams.get("port") ?? "",
  };
};

export const GET = proxyGet("/admin/server-browsers");
export const POST = proxyPost("/admin/server-browsers");

export async function PUT(req: Request) {
  return withJsonBody(req, body =>
    proxyToBackendChange("/admin/server-browsers", body, "PUT", browserParams(req)));
}

export async function DELETE(req: Request) {
  return await proxyToBackendChange("/admin/server-browsers", null, "DELETE", browserParams(req));
}
