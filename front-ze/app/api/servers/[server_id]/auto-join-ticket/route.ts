import { proxyPost } from "lib/apiProxy";

// Exchanges the session for a ticket naming the user in the server's auto join waiting list; the
// page's EventSource cannot send the session's Authorization header itself.
export const POST = proxyPost(p => `/events/servers/${p.server_id}/players/ticket`, { body: false });
