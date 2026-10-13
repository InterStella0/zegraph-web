import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet("/accounts/me/push/subscriptions", { query: false });
