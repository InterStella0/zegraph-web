/** Player stats the backend only serves to logged-in visitors (see `RequiredAnonymousTokenBearer`). */
export const LOGIN_STAT_PATHS: ReadonlySet<string> = new Set(['hours_of_day', 'online_heatmap', 'map_pull'])
