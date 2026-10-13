import { proxyGet, proxyPost } from "lib/apiProxy";

export const GET = proxyGet("/community-links");
export const POST = proxyPost("/community-links");
