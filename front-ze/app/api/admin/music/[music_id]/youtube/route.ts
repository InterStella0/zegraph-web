import { proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/music/${p.music_id}/youtube`);
