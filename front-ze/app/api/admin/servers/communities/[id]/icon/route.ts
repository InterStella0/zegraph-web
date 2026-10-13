import { forwardRaw } from "lib/apiProxy";

export const POST = forwardRaw("POST", p => `/admin/communities/${p.id}/icon`, 'form');
