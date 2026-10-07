import { auth } from "auth.ts";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.backendJwt) {
    return Response.json({ data: null, msg: "Unauthorized", code: 401 }, { status: 401 });
  }
  const formData = await req.formData()

  const backendUrl = `${process.env.BACKEND_URL || 'http://backend:3000'}/admin/announcements/media`
  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.backendJwt}` },
    body: formData,
  })

  const data = await response.text()

  return new Response(data, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
