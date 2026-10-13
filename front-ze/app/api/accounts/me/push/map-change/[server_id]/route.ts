import { proxyDelete } from "lib/apiProxy";

export const DELETE = proxyDelete(p => `/accounts/me/push/map-change/${p.server_id}`);
