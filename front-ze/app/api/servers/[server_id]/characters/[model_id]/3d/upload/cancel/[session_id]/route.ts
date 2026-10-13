import { forwardRaw } from "lib/apiProxy";

export const DELETE = forwardRaw("DELETE", p => `/servers/${p.server_id}/characters/${p.model_id}/3d/upload/cancel/${p.session_id}`);
