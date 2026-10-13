import { proxyDelete, proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/special-thanks/${p.id}`);
export const DELETE = proxyDelete(p => `/special-thanks/${p.id}`);
