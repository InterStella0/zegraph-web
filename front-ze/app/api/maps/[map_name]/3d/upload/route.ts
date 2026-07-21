import {auth} from "../../../../../../auth.ts";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ map_name: string }> }
) {
  const { map_name } = await params
  const session = await auth();
  const formData = await req.formData()

  const backendUrl = `${process.env.BACKEND_URL || 'http://backend:3000'}/maps/${map_name}/3d/upload`
  const headers = {}
  headers["Authorization"] = `Bearer ${session.backendJwt}`;
  const response = await fetch(backendUrl, {
    method: 'POST',
    headers,
    body: formData,
  })

  const data = await response.text()

  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
