import { proxyDelete, proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/communities/${p.id}`);
export const DELETE = proxyDelete(p => `/admin/communities/${p.id}`);
