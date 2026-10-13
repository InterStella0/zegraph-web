import { proxyGet, proxyPost, proxyToBackendChange } from "lib/apiProxy";
import { NextResponse } from "next/server";
import { BACKEND_DOMAIN } from "utils/generalUtils";
import { auth } from "auth";

const browserPath = (req: Request) => {
  const url = new URL(req.url);
  const ip = url.searchParams.get("ip") ?? "";
  const port = url.searchParams.get("port") ?? "";
  return `/admin/server-browsers?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`;
};

export const GET = proxyGet("/admin/server-browsers");
export const POST = proxyPost("/admin/server-browsers");

export async function PUT(req: Request) {
  const path = browserPath(req);
  return await proxyToBackendChange(path, await req.json(), "PUT");
}

export async function DELETE(req: Request) {
  const backendUrl = BACKEND_DOMAIN + browserPath(req);
  const session = await auth();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (session?.backendJwt) headers["Authorization"] = `Bearer ${session.backendJwt}`;

  const res = await fetch(backendUrl, { method: "DELETE", headers });
  return NextResponse.json(res.ok ? await res.json() : await res.text(), { status: res.status });
}
