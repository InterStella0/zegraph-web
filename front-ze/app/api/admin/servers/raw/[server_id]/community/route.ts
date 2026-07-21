import { proxyToBackendChange } from "lib/apiProxy";

export async function PUT(req: Request, { params }: { params: Promise<{ server_id: string }> }) {
  const { server_id } = await params;
  const body = await req.json();
  return await proxyToBackendChange(`/admin/servers-list/${server_id}/community`, body, "PUT");
}
