import { proxyGet, proxyToBackendChange } from "lib/apiProxy";
import { NextResponse } from "next/server";

export const GET = proxyGet("/admin/maps/metadata");

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const mapName = searchParams.get("map");
  if (!mapName) return NextResponse.json({ error: "Missing map name" }, { status: 400 });
  return await proxyToBackendChange(`/admin/maps/${mapName}`, null, "DELETE");
}
