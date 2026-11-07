import {DOMAIN, formatHours, StillCalculate} from "utils/generalUtils";
import type {MapAnalyze, MapDetail} from "types/maps";
import {GAMES, knownGames} from "utils/games";

/** A map page's info and analysis; while the backend is still calculating, the detail is `notReady` instead of an error. */
export async function loadMapDetail<I>(name: string, info: Promise<I>, analyze: Promise<MapAnalyze>): Promise<MapDetail<I>> {
    try {
        const [mapInfo, mapAnalyze] = await Promise.all([info, analyze])
        return {name, info: mapInfo, analyze: mapAnalyze, notReady: false}
    } catch (error) {
        if (error instanceof StillCalculate) return {name, info: null, analyze: null, notReady: true}
        throw error
    }
}

/** Schema.org data for a map page; `where` ends the description, e.g. "on <community>". */
export const mapJsonLd = (
    name: string, analyze: MapAnalyze, where: string, path: string, creators?: string | null,
    games?: (string | null | undefined)[],
) => ({
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": name,
    "genre": "Zombie Escape",
    "description": `Zombie Escape map with ${formatHours(analyze.cum_player_hours || 0)} of cumulative playtime ${where}`,
    "isPartOf": knownGames(games).map(id => ({"@type": "VideoGame", "name": GAMES[id].name, "gamePlatform": "PC"})),
    "interactionStatistic": {
        "@type": "InteractionCounter",
        "interactionType": "https://schema.org/PlayAction",
        "userInteractionCount": analyze.unique_players || 0,
    },
    ...(creators && {"author": {"@type": "Person", "name": creators}}),
    "url": `${DOMAIN}${path}`,
})
