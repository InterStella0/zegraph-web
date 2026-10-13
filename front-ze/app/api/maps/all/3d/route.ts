import { proxyToBackend } from "lib/apiProxy"

export async function GET(req: Request) {
  return await proxyToBackend("/maps/all/3d", req)
}
