import { proxyGet } from "lib/apiProxy";

export const GET = proxyGet(p => `/maps/${p.map_name}/3d`);
