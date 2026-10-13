import {auth} from "../../../../../../../auth.ts";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ map_name: string }> }
) {
  const { map_name } = await params
  const session = await auth();
  const body = await req.text()

  const backendUrl = `${process.env.BACKEND_URL || 'http://backend:3000'}/maps/${map_name}/3d/upload/initiate`
  const headers: Record<string, string> = {}
  headers["Authorization"] = `Bearer ${session.backendJwt}`;
  headers["Content-Type"] = "application/json";

  const response = await fetch(backendUrl, {
    method: 'POST',
    headers,
    body,
  })

  const data = await response.text()

  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
