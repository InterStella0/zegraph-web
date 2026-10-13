import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet("/accounts/me/push/vapid-public-key", { query: false });
