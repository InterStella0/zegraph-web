import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/maps/${encodeURIComponent(p.map_name)}/info`, { cache: 'LIVE' });
