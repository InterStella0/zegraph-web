import { proxyPost } from "lib/apiProxy";

export const POST = proxyPost(p => `/servers/${p.server_id}/maps/${p.map_name}/unset-favorite`, { body: false });
