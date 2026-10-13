import { proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/player-claims/${p.claim_id}/status`);
