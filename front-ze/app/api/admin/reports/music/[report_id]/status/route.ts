import { proxyPut } from "lib/apiProxy";

export const PUT = proxyPut(p => `/admin/reports/music/${p.report_id}/status`);
