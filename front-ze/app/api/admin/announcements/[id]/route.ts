import { proxyDelete, proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/announcements/${p.id}`);
export const DELETE = proxyDelete(p => `/admin/announcements/${p.id}`);
