import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/players/${p.player_id}/communities_playtime`);
