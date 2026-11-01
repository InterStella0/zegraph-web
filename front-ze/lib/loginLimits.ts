// How far logged-out visitors can page, mirroring ANONYMOUS_SESSION_ROWS / ANONYMOUS_TOP_PLAYERS in
// the backend's src/core/utils.rs. Past these the backend answers 403 and the UI shows LoginLocked.

/** A player's newest 90 sessions: pages 0-8 at 10 per page. */
export const ANONYMOUS_SESSION_PAGES = 9

/** A map's top 10 players: page 0 only, and no name search. */
export const ANONYMOUS_TOP_PLAYER_PAGES = 1
