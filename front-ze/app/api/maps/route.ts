import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet("/maps", { cache: 'LIVE' });
