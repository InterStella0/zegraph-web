import { proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/server-requests/${p.request_id}/status`);
