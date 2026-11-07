/** Games a tracked server can run, keyed by `server.game` (Steam app id, plus a variant for CS). */
export const GAMES: Record<string, { label: string; name: string }> = {
    "730_cs2":  { label: "CS2",   name: "Counter-Strike 2" },
    "730_csgo": { label: "CS:GO", name: "Counter-Strike: Global Offensive" },
    "240":      { label: "CS:S",  name: "Counter-Strike: Source" },
    "440":      { label: "TF2",   name: "Team Fortress 2" },
}

/** Display order everywhere games are listed. */
export const GAME_ORDER = Object.keys(GAMES)

/** The distinct, known games out of `ids`, in display order; every game when `ids` has none. */
export function knownGames(ids?: (string | null | undefined)[]): string[] {
    const present = new Set(ids)
    const found = GAME_ORDER.filter(id => present.has(id))
    return found.length > 0 ? found : GAME_ORDER
}
