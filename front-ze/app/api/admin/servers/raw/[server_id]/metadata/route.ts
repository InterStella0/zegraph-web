import { proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/servers-list/${p.server_id}/metadata`);
