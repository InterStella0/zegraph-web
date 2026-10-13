import { forwardRaw } from "lib/apiProxy";

export const DELETE = forwardRaw("DELETE", p => `/maps/${p.map_name}/3d/upload/cancel/${p.session_id}`);
