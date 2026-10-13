import { proxyGet, proxyPost } from "lib/apiProxy";

export const GET = proxyGet("/admin/announcements");
export const POST = proxyPost("/admin/announcements");
