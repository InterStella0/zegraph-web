import { proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/players/${p.player_id}/associated`);
