import { proxyDelete } from "lib/apiProxy";

export const DELETE = proxyDelete(p => `/accounts/me/push/map-notify/${p.map_name}`, { query: ['server_id'] });
