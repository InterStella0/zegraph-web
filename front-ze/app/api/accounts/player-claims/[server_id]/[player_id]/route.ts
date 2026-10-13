import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/accounts/player-claims/${p.server_id}/${p.player_id}`);
