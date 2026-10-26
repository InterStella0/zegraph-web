import { proxyPost } from "lib/apiProxy";

export const POST = proxyPost(p => `/maps/${encodeURIComponent(p.map_name)}/set-favorite`, { body: false });
