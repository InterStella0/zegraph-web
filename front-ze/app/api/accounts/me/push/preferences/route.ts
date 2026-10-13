import { proxyGet, proxyPut } from "lib/apiProxy";

export const GET = proxyGet("/accounts/me/push/preferences");
export const PUT = proxyPut("/accounts/me/push/preferences");
