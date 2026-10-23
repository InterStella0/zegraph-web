import { proxyDelete, proxyGet, proxyPost, proxyPut } from "lib/apiProxy";

export const GET = proxyGet("/admin/server-browsers");
export const POST = proxyPost("/admin/server-browsers");
export const PUT = proxyPut("/admin/server-browsers", { query: ["ip", "port"] });
export const DELETE = proxyDelete("/admin/server-browsers", { query: ["ip", "port"] });
