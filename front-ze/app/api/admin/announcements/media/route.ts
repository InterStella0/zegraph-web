import { auth } from "auth.ts";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 + 64 * 1024;

const error = (msg: string, status: number) =>
  Response.json({ data: null, msg, code: status }, { status });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.backendJwt) {
    return error("Unauthorized", 401);
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data') || !req.body) {
    return error("Expected a multipart/form-data upload", 400);
  }
  if (Number(req.headers.get('content-length')) > MAX_UPLOAD_BYTES) {
    return error("File is larger than 50 MB", 413);
  }

  const backendUrl = `${process.env.BACKEND_URL || 'http://backend:3000'}/admin/announcements/media`
  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.backendJwt}`,
        'Content-Type': contentType,
      },
      body: req.body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return error("Upload failed, the server could not be reached", 502);
  }
}
