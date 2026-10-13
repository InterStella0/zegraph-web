import { proxyToBackend } from "lib/apiProxy"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ map_name: string }> }
) {
  const { map_name } = await params
  return await proxyToBackend(`/maps/${map_name}/3d`, req)
}
