import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/players/${p.player_id}/online-activity`);
