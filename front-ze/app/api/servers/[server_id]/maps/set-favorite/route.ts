import { proxyPost } from "lib/apiProxy";

export const POST = proxyPost(p => `/servers/${p.server_id}/maps/set-favorite`);
