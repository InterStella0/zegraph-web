import { proxyToBackendChange } from "lib/apiProxy";

export async function PUT(req: Request, { params }: { params: Promise<{ server_id: string }> }) {
  const { server_id } = await params;
  const body = await req.json();
  return await proxyToBackendChange(`/admin/servers-list/${server_id}`, body, "PUT");
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ server_id: string }> }) {
  const { server_id } = await params;
  return await proxyToBackendChange(`/admin/servers-list/${server_id}`, null, "DELETE");
}
