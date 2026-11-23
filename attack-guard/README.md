# attack-guard

A bash loop (`guard.sh`, using `curl` and `jq`) that switches Cloudflare's **Under Attack** mode on when scrapers flood the site, then switches it back off.

1. It picks a random watch window between 1 and 20 minutes.
2. Every minute it reads `users_on_product` from `https://live.eu.posthog.com/stats`. This is the
   "Users online" counter on PostHog's Live tab.
3. If every reading for the whole window is above 10, it saves the zone's current security level
   and sets it to `under_attack`.
4. After a random cooldown between 5 and 15 minutes it restores the saved level and goes back to
   step 1 with a new random window.

The windows are random so that nobody reading this script can time their scraping around it.
Random numbers come from `/dev/urandom`.

The saved level and the cooldown deadline live in `/data/state.json` (the `attack-guard-state`
volume). If the service restarts during a cooldown, it carries on with the remaining time and then
turns the mode off. If someone turned Under Attack mode on by hand, the service leaves it alone.

## Configuration

Set these in Dokploy's runtime env (and in `.env` for `docker compose`):

| Variable | Default | Notes |
|---|---|---|
| `ATTACK_GUARD_POSTHOG_PROJECT_ID` | — | PostHog project id. |
| `ATTACK_GUARD_POSTHOG_PERSONAL_API_KEY` | — | Personal API key with the `project:read` scope. It is used to fetch the project's `live_events_token`, the short-lived JWT that `/stats` expects. A new token is fetched whenever `/stats` rejects the old one. |
| `ATTACK_GUARD_CLOUDFLARE_API_TOKEN` | — | API token with **Zone → Zone Settings → Edit** on the zone. |
| `ATTACK_GUARD_CLOUDFLARE_ZONE_ID` | — | Shown on the zone's Overview page. |
| `ATTACK_GUARD_THRESHOLD` | `10` | Turns on above this many users online. |
| `ATTACK_GUARD_SUSTAINED_MINUTES_MIN` / `_MAX` | `1` / `20` | Range for the watch window. |
| `ATTACK_GUARD_COOLDOWN_MINUTES_MIN` / `_MAX` | `5` / `15` | Range for how long Under Attack mode stays on. |
| `ATTACK_GUARD_POLL_INTERVAL_SECONDS` | `60` | Readings needed = window / interval, rounded up. |
| `ATTACK_GUARD_DRY_RUN` | `false` | `true` logs what it would change and leaves Cloudflare untouched. |
| `ATTACK_GUARD_POSTHOG_API_HOST` / `_LIVE_HOST` | EU cloud | Change these for US cloud. |

A failed reading resets the streak, so stale numbers never switch the mode on. Run one replica only:
two copies would fight over the zone setting.
