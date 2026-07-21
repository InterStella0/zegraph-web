import { proxyToBackend, proxyToBackendChange } from "lib/apiProxy";
import { NextResponse } from "next/server";
import { BACKEND_DOMAIN } from "utils/generalUtils";
import { auth } from "auth";

export async function GET(req: Request) {
  return await proxyToBackend("/admin/server-browsers", req);
}

export async function POST(req: Request) {
  const body = await req.json();
  return await proxyToBackendChange("/admin/server-browsers", body, "POST");
}

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const ip = url.searchParams.get("ip") ?? "";
  const port = url.searchParams.get("port") ?? "";
  const body = await req.json();
  return await proxyToBackendChange(`/admin/server-browsers?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`, body, "PUT");
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const ip = url.searchParams.get("ip") ?? "";
  const port = url.searchParams.get("port") ?? "";

  const session = await auth();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  // @ts-ignore
  if (session?.backendJwt) headers["Authorization"] = `Bearer ${(session as any).backendJwt}`;

  const backendUrl = `${BACKEND_DOMAIN}/admin/server-browsers?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`;
  const res = await fetch(backendUrl, { method: "DELETE", headers });
  if (res.ok) return NextResponse.json(await res.json(), { status: res.status });
  return NextResponse.json(await res.text(), { status: res.status });
}
