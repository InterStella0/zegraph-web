#!/usr/bin/env bash
#
# Brings up the staging stack on the machine it is run from.
#
# The staging counterpart of deploy-scripts.sh, minus the parts that only make sense for production:
# it builds and runs on the same host, so there is no registry push and no ssh hop.
#
#   ./deploy-staging.sh                # reset the database only if db.sql changed, then deploy
#   RESET_DB=1 ./deploy-staging.sh     # force a database rebuild
#   DB_ONLY=1 ./deploy-staging.sh      # bring up and seed the database, stop there
#   SKIP_BUILD=1 ./deploy-staging.sh   # images were already built (CI builds them in the gate job)
#
# DB_ONLY exists because the gate has to run first: sqlx checks its queries at compile time, so the
# database must already carry this branch's db.sql before anything is built. CI calls DB_ONLY=1 in
# the gate job and SKIP_BUILD=1 in the deploy job, where the schema marker makes the reset a no-op.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

readonly PROJECT="${STAGING_PROJECT:-ze-staging}"
readonly COMPOSE_FILE="${STAGING_COMPOSE_FILE:-compose.staging.yaml}"
readonly SCHEMA_FILE="db.sql"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

[[ -f .env ]] || die ".env is missing. CI stages it from the STAGING_ENV_LOCATION repository
variable; locally, copy default.staging.env and fill it in."

set -a
# shellcheck disable=SC1091
source .env
set +a

for v in DB_NAME DB_USERNAME DATABASE_URL BUILD_DATABASE_URL; do
    [[ -n "${!v:-}" ]] || die "$v is not set in .env (see default.staging.env)."
done

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }

# --- database ---------------------------------------------------------------------------------

info "Starting staging postgres"
dc up -d postgres

# `up -d` returns before the healthcheck passes, and everything downstream needs a live database.
for _ in $(seq 60); do
    [[ "$(dc ps postgres --format '{{.Health}}' 2>/dev/null)" == "healthy" ]] && break
    sleep 2
done
[[ "$(dc ps postgres --format '{{.Health}}' 2>/dev/null)" == "healthy" ]] ||
    die "staging postgres did not become healthy. Logs:
$(dc logs --tail 30 postgres)"

# staging_schema_marker records the db.sql the database was built from. A missing table (fresh
# volume, or an interrupted replay) reads as empty and forces a rebuild.
schema_sha=$(sha256sum "$SCHEMA_FILE" | cut -d' ' -f1)
applied_sha=$(dc exec -T postgres psql -tAq -U "$DB_USERNAME" -d "$DB_NAME" \
    -c "SELECT sha FROM public.staging_schema_marker ORDER BY applied_at DESC LIMIT 1" \
    2>/dev/null | tr -d '[:space:]' || true)

if [[ "${RESET_DB:-0}" == "1" || "$applied_sha" != "$schema_sha" ]]; then
    if [[ "${RESET_DB:-0}" == "1" ]]; then
        reason="forced"
    elif [[ -z "$applied_sha" ]]; then
        reason="no schema marker -- fresh volume or an interrupted replay"
    else
        reason="$SCHEMA_FILE changed"
    fi
    info "Rebuilding the staging database ($reason)"
    # Nothing should be holding connections while the database is dropped; DROP ... WITH (FORCE)
    # would kick them anyway, but a live backend would then sit on a dead pool.
    dc stop backend worker >/dev/null 2>&1 || true
    bash ./deployment/staging-db-reset.sh
else
    info "Staging database already matches $SCHEMA_FILE, leaving it alone"
fi

if [[ "${DB_ONLY:-0}" == "1" ]]; then
    # Host and port only: HOST_DATABASE_URL carries the password and this runs in CI logs.
    info "Database ready on ${STAGING_DB_HOST_ADDR:-172.17.0.1}:${STAGING_DB_HOST_PORT:-55432}/$DB_NAME"
    exit 0
fi

# --- stack ------------------------------------------------------------------------------------

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
    info "Building images"
    dc build
fi

info "Deploying"
dc up -d --remove-orphans

# Rebuilding every service on every push leaves a lot of dangling layers on a home machine.
docker image prune -f >/dev/null

info "Staging is up on port ${STAGING_EXPOSE_PORT:-51021}"
dc ps
