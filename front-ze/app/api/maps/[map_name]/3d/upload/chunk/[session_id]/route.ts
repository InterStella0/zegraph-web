import {auth} from "../../../../../../../../auth.ts";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ map_name: string; session_id: string }> }
) {
  const { map_name, session_id } = await params
  const session = await auth();
  const formData = await req.formData()

  const backendUrl = `${process.env.BACKEND_URL || 'http://backend:3000'}/maps/${map_name}/3d/upload/chunk/${session_id}`
  const headers: Record<string, string> = {}
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
