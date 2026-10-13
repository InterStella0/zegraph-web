import { proxyGet } from "lib/apiProxy";

// Deliberately no cache preset: the response varies by requester. `player_id` can be the literal
// "me", and owners see communities they anonymized while others do not — a shared CDN entry would
// serve one user's history to the next visitor.
export const GET = proxyGet(p => `/players/${p.player_id}/sessions`);
