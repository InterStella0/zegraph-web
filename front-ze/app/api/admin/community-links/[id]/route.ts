import { proxyDelete, proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/community-links/${p.id}`);
export const DELETE = proxyDelete(p => `/community-links/${p.id}`);
