import { forwardRaw } from "lib/apiProxy";

export const POST = forwardRaw("POST", p => `/maps/${p.map_name}/3d/upload/complete/${p.session_id}`);
