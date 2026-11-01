import { proxyGet } from "lib/apiProxy";

// No cache preset: pages past the top 10 are login-only, so responses can depend on the viewer.
export const GET = proxyGet(p => `/servers/${p.server_id}/maps/${p.map_name}/top_players`);
