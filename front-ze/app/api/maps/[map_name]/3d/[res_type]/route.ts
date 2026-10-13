import { proxyDelete } from "lib/apiProxy";

export const DELETE = proxyDelete(p => `/maps/${p.map_name}/3d/${p.res_type}`);
