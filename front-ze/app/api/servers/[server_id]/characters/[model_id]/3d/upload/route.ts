import { auth } from "../../../../../../../../auth.ts";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ server_id: string; model_id: string }> }
) {
  const { server_id, model_id } = await params
  const session = await auth();
  const formData = await req.formData()

  const backendUrl = `${process.env.BACKEND_URL || 'http://backend:3000'}/servers/${server_id}/characters/${model_id}/3d/upload`
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
    headers: { 'Content-Type': 'application/json' },
  })
}
