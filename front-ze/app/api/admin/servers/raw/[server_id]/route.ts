import { proxyDelete, proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/servers-list/${p.server_id}`);
export const DELETE = proxyDelete(p => `/admin/servers-list/${p.server_id}`);
