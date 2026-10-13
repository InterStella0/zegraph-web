import { proxyGet, proxyPost } from "lib/apiProxy";

export const GET = proxyGet("/admin/communities");
export const POST = proxyPost("/admin/communities");
