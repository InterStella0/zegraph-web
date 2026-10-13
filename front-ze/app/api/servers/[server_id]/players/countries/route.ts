import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/servers/${p.server_id}/players/countries`, { query: false });
