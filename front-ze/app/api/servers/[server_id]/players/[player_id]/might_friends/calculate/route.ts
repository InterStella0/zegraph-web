import { proxyPost } from "lib/apiProxy";

export const POST = proxyPost(p => `/servers/${p.server_id}/players/${p.player_id}/might_friends/calculate`, { body: false });
