import { proxyToBackendChange } from "lib/apiProxy"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ map_name: string; res_type: string }> }
) {
  const { map_name, res_type } = await params
  return await proxyToBackendChange(`/maps/${map_name}/3d/${res_type}`, null, "DELETE")
}
