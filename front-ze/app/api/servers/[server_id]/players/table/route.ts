import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/servers/${p.server_id}/players/table`, { cache: 'PLAYER_STATS' });
