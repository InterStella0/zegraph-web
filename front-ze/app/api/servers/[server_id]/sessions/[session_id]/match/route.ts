import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/servers/${p.server_id}/sessions/${p.session_id}/match`, { query: false });
