import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/servers/${p.server_id}/players/${p.player_id}/external_stats`, { query: false });
