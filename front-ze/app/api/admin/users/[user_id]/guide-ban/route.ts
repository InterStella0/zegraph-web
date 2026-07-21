import { proxyToBackendChange } from "lib/apiProxy";
import type { CreateBanDto } from "types/admin";

// POST /api/admin/users/[user_id]/guide-ban
export async function POST(
    req: Request,
    context: { params: Promise<{ user_id: string }> }
) {
    const { user_id } = await context.params;
    const body: CreateBanDto = await req.json();
    return await proxyToBackendChange(`/admin/users/${user_id}/guide-ban`, body, "POST");
}

// DELETE /api/admin/users/[user_id]/guide-ban
export async function DELETE(
    _req: Request,
    context: { params: Promise<{ user_id: string }> }
) {
    const { user_id } = await context.params;
    return await proxyToBackendChange(`/admin/users/${user_id}/guide-ban`, null, "DELETE");
}
