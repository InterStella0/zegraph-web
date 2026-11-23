#!/usr/bin/env bash
set -uo pipefail

: "${POSTHOG_PROJECT_ID:?POSTHOG_PROJECT_ID is not set}"
: "${POSTHOG_PERSONAL_API_KEY:?POSTHOG_PERSONAL_API_KEY is not set}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set}"
: "${CLOUDFLARE_ZONE_ID:?CLOUDFLARE_ZONE_ID is not set}"
POSTHOG_API_HOST=${POSTHOG_API_HOST:-https://eu.posthog.com}
POSTHOG_LIVE_HOST=${POSTHOG_LIVE_HOST:-https://live.eu.posthog.com}
CLOUDFLARE_API_BASE=${CLOUDFLARE_API_BASE:-https://api.cloudflare.com/client/v4}
USERS_THRESHOLD=${USERS_THRESHOLD:-10}
SUSTAINED_MINUTES_MIN=${SUSTAINED_MINUTES_MIN:-1}
SUSTAINED_MINUTES_MAX=${SUSTAINED_MINUTES_MAX:-20}
COOLDOWN_MINUTES_MIN=${COOLDOWN_MINUTES_MIN:-5}
COOLDOWN_MINUTES_MAX=${COOLDOWN_MINUTES_MAX:-15}
POLL_INTERVAL_SECONDS=${POLL_INTERVAL_SECONDS:-60}
STATE_PATH=${STATE_PATH:-/data/state.json}
HISTORY_PATH=${HISTORY_PATH:-/data/triggers.log}
DRY_RUN=${DRY_RUN:-false}

die() { echo "$*" >&2; exit 1; }
for var in USERS_THRESHOLD SUSTAINED_MINUTES_MIN SUSTAINED_MINUTES_MAX COOLDOWN_MINUTES_MIN COOLDOWN_MINUTES_MAX POLL_INTERVAL_SECONDS; do
  [[ ${!var} =~ ^[0-9]+$ ]] || die "$var=${!var} is not a whole number"
done
(( SUSTAINED_MINUTES_MIN > 0 && POLL_INTERVAL_SECONDS > 0 )) || die "SUSTAINED_MINUTES_MIN and POLL_INTERVAL_SECONDS must be at least 1"
(( SUSTAINED_MINUTES_MIN <= SUSTAINED_MINUTES_MAX )) || die "SUSTAINED_MINUTES_MIN is above SUSTAINED_MINUTES_MAX"
(( COOLDOWN_MINUTES_MIN <= COOLDOWN_MINUTES_MAX )) || die "COOLDOWN_MINUTES_MIN is above COOLDOWN_MINUTES_MAX"

LIVE_TOKEN=

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Also kept on the volume, since container logs go away when the task is replaced.
event() { log "$*"; log "$*" >> "$HISTORY_PATH" || log "writing $HISTORY_PATH failed"; }

# random LO HI, inclusive. /dev/urandom rather than $RANDOM, which is guessable from the pid and time.
random() { echo $(( $1 + $(od -An -N4 -tu4 /dev/urandom) % ($2 - $1 + 1) )); }

new_window() {
  window=$(random "$SUSTAINED_MINUTES_MIN" "$SUSTAINED_MINUTES_MAX")
  needed=$(( (window * 60 + POLL_INTERVAL_SECONDS - 1) / POLL_INTERVAL_SECONDS ))
  streak=0
  log "watching for $window min ($needed polls)"
}

# Fed to curl as a header file so tokens never show up in `ps`.
auth() { printf 'Authorization: Bearer %s\n' "$1"; }

# Sets BODY and STATUS.
http() {
  local out
  if ! out=$(curl -sS -m 30 -w '\n%{http_code}' "$@" 2>&1); then
    STATUS=000 BODY=$out
    return 1
  fi
  STATUS=${out##*$'\n'}
  BODY=${out%$'\n'*}
}

fetch_token() {
  http -H @<(auth "$POSTHOG_PERSONAL_API_KEY") "$POSTHOG_API_HOST/api/projects/$POSTHOG_PROJECT_ID/" \
    || { log "posthog project request failed: $BODY"; return 1; }
  [[ $STATUS == 200 ]] || { log "posthog project returned $STATUS: ${BODY:0:300}"; return 1; }
  LIVE_TOKEN=$(jq -er '.live_events_token // empty' <<<"$BODY") \
    || { log "posthog project has no live_events_token"; return 1; }
}

# Sets USERS.
users_online() {
  local attempt
  for attempt in 1 2; do
    [[ -n $LIVE_TOKEN ]] || fetch_token || return 1
    http -H @<(auth "$LIVE_TOKEN") "$POSTHOG_LIVE_HOST/stats" \
      || { log "livestream request failed: $BODY"; return 1; }
    if [[ $STATUS == 401 || $STATUS == 403 ]] && (( attempt == 1 )); then
      log "livestream rejected the token, refetching it"
      LIVE_TOKEN=
      continue
    fi
    [[ $STATUS == 200 ]] || { log "livestream returned $STATUS: ${BODY:0:300}"; return 1; }
    USERS=$(jq -er '.users_on_product | numbers | floor' <<<"$BODY") \
      || { log "livestream response has no users_on_product: ${BODY:0:300}"; return 1; }
    return 0
  done
  log "livestream rejected a freshly fetched token"
  return 1
}

# cf METHOD [JSON]. Sets LEVEL to the zone's security level.
cf() {
  local extra=()
  [[ -n ${2:-} ]] && extra=(-H 'Content-Type: application/json' --data "$2")
  http -X "$1" -H @<(auth "$CLOUDFLARE_API_TOKEN") "${extra[@]}" \
    "$CLOUDFLARE_API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/security_level" \
    || { log "cloudflare request failed: $BODY"; return 1; }
  LEVEL=$(jq -er 'select(.success == true) | .result.value' <<<"$BODY" 2>/dev/null) \
    || { log "cloudflare returned $STATUS: $(jq -c '.errors' <<<"$BODY" 2>/dev/null || echo "${BODY:0:300}")"; return 1; }
}

set_level() {
  if [[ $DRY_RUN == true ]]; then
    log "DRY_RUN: would set the security level to $1"
    return 0
  fi
  cf PATCH "$(jq -nc --arg v "$1" '{value: $v}')" && log "security level set to $LEVEL"
}

check() {
  if ! users_online; then
    streak=0
    return
  fi
  if (( USERS > USERS_THRESHOLD )); then streak=$(( streak + 1 )); else streak=0; fi
  log "users online: $USERS (threshold $USERS_THRESHOLD, streak $streak/$needed)"
  (( streak >= needed )) || return 0

  cf GET || return
  if [[ $LEVEL == under_attack ]]; then
    log "traffic is sustained but under attack mode is already on by hand; leaving it alone"
    return
  fi
  local prev=$LEVEL cooldown
  cooldown=$(random "$COOLDOWN_MINUTES_MIN" "$COOLDOWN_MINUTES_MAX")
  # Written before the PATCH, so a crash right after it still ends with the old level restored.
  jq -nc --arg l "$prev" --argjson u $(( $(date +%s) + cooldown * 60 )) \
    '{restore_level: $l, until_unix: $u}' > "$STATE_PATH.tmp" && mv "$STATE_PATH.tmp" "$STATE_PATH" \
    || { log "writing $STATE_PATH failed"; return; }
  if ! set_level under_attack; then
    rm -f "$STATE_PATH"
    return
  fi
  event "TRIGGERED: under attack mode ON for $cooldown min, users online above $USERS_THRESHOLD for $window min (last reading $USERS), was $prev"
}

tick() {
  [[ -f $STATE_PATH ]] || { check; return; }
  local restore until left
  read -r restore until < <(jq -r '"\(.restore_level) \(.until_unix)"' "$STATE_PATH" 2>/dev/null)
  if [[ -z ${restore:-} || ! ${until:-} =~ ^[0-9]+$ ]]; then
    log "$STATE_PATH is corrupt; fix or delete it"
    return
  fi
  left=$(( until - $(date +%s) ))
  if (( left > 0 )); then
    log "cooling down, $(( (left + 59) / 60 )) min left"
    return
  fi
  set_level "$restore" || return
  rm -f "$STATE_PATH"
  event "RESTORED: under attack mode OFF, security level back to $restore"
  new_window
}

trap 'log "shutting down"; exit 0' TERM INT

log "attack guard starting: above $USERS_THRESHOLD users for $SUSTAINED_MINUTES_MIN-$SUSTAINED_MINUTES_MAX min, cooldown $COOLDOWN_MINUTES_MIN-$COOLDOWN_MINUTES_MAX min, polling every ${POLL_INTERVAL_SECONDS}s, dry run $DRY_RUN"
new_window
while true; do
  tick
  sleep "$POLL_INTERVAL_SECONDS" &
  wait $!
done
