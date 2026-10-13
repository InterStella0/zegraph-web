import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/servers/${p.server_id}/maps/last/sessions`, { cache: 'LIVE' });
