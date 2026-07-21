import { proxyToBackendChange } from "lib/apiProxy";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  return await proxyToBackendChange(`/community-links/${id}`, body, "PUT");
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return await proxyToBackendChange(`/community-links/${id}`, null, "DELETE");
}
