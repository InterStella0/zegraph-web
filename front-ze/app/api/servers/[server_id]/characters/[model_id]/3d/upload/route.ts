import { forwardRaw } from "lib/apiProxy";

export const POST = forwardRaw("POST", p => `/servers/${p.server_id}/characters/${p.model_id}/3d/upload`, 'form');
