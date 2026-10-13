import { proxyGet, proxyPost } from "lib/apiProxy";

export const GET = proxyGet("/special-thanks");
export const POST = proxyPost("/special-thanks");
