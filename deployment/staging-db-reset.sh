#!/usr/bin/env bash
#
# Rebuilds the staging database from db.sql.
#
# Staging starts empty on purpose, so this drops the database outright and replays db.sql into a
# fresh one. It can only ever reach the `postgres` service inside the ze-staging compose project,
# so it has no way to touch the production database even if the .env is wrong.
#
# psql runs inside the container, so the runner needs no postgres client installed.
#
#   ./staging-db-reset.sh          # drop, recreate, replay db.sql

set -euo pipefail

# db.sql, .env and the compose file live at the repo root, one level up from this script.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

readonly SCHEMA_FILE="db.sql"
readonly PROJECT="${STAGING_PROJECT:-ze-staging}"
readonly COMPOSE_FILE="${STAGING_COMPOSE_FILE:-compose.staging.yaml}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m==>\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

# .env holds the DB_* pieces DATABASE_URL is interpolated from, so it needs `set -a` to export them.
if [[ -z "${DB_NAME:-}" && -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

for v in DB_NAME DB_USERNAME; do
    [[ -n "${!v:-}" ]] || die "$v is not set and .env did not provide it."
done

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }

# -q keeps psql from echoing every statement; ON_ERROR_STOP is set per call because the replay
# deliberately runs with it off.
psql_db() {
    local db=$1; shift
    dc exec -T postgres psql -v ON_ERROR_STOP=1 -tAq -U "$DB_USERNAME" -d "$db" "$@"
}

dc ps --status running --services 2>/dev/null | grep -qx postgres ||
    die "the staging postgres service is not running. Start it first:
    docker compose -p $PROJECT -f $COMPOSE_FILE up -d postgres"

# --- rebuild ----------------------------------------------------------------------------------

info "Recreating database $DB_NAME"
# FORCE terminates any backend/worker connections still holding the old database open.
psql_db postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" >/dev/null
psql_db postgres -c "CREATE DATABASE \"$DB_NAME\"" >/dev/null

# pg_cron is the one thing db.sql cannot bring with it: it is not in the postgis image, and it can
# only ever live on one database per cluster. Stubbing schedule_in_database lets the rest of db.sql
# run untouched; the trade-off is that materialized views never refresh in staging.
#
# Deliberately NOT stubbed: layers.countries_fixed. check-schema.sh stubs it because that script
# excludes the layers schema from its diff, but db.sql declares the real table in full at line 999.
# Creating a stub first makes db.sql's own CREATE TABLE fail as "already exists", leaving a 3-column
# table behind and breaking every query that reads "CONTINENT" and friends.
info "Installing pg_cron stub"
psql_db "$DB_NAME" -c "
CREATE SCHEMA cron;
CREATE TABLE cron.expected_jobs(jobname TEXT, schedule TEXT, database TEXT);
CREATE FUNCTION cron.schedule_in_database(jobname TEXT, schedule TEXT, command TEXT, database TEXT)
RETURNS BIGINT LANGUAGE sql AS \$\$
    INSERT INTO cron.expected_jobs VALUES (jobname, schedule, database) RETURNING 0::BIGINT;
\$\$;" >/dev/null

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

# The CREATE EXTENSION line is blanked in place rather than deleted so error line numbers still
# match db.sql.
sed 's/^\(CREATE EXTENSION .*pg_cron.*\)$/-- [staging] \1/' "$SCHEMA_FILE" > "$workdir/replay.sql"

info "Replaying $SCHEMA_FILE"
dc exec -T postgres psql -v ON_ERROR_STOP=0 -q -U "$DB_USERNAME" -d "$DB_NAME" \
    < "$workdir/replay.sql" > "$workdir/load.log" 2>&1 || true

# Keep the LINE/caret lines psql prints under a syntax error; they point at the offending token,
# which the statement-level line number alone does not.
grep -E '^(ERROR|FATAL|psql:.*(ERROR|FATAL)|LINE [0-9]+:|[[:space:]]+\^)' "$workdir/load.log" \
    > "$workdir/load-errors.txt" || true

load_errors=$(grep -cE 'ERROR|FATAL' "$workdir/load-errors.txt" || true)

if [[ "$load_errors" -gt 0 ]]; then
    warn "$SCHEMA_FILE did not replay cleanly ($load_errors statements failed)"
    sed 's/^/    /' "$workdir/load-errors.txt" >&2
    die "staging database is not usable until $SCHEMA_FILE loads cleanly."
fi

# Records which db.sql this database was built from, so deploy-staging.sh can tell whether a later
# push actually needs another reset. Written last, so an interrupted replay leaves no marker and the
# next deploy rebuilds.
psql_db "$DB_NAME" -c "
CREATE TABLE public.staging_schema_marker(sha TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT now());
INSERT INTO public.staging_schema_marker(sha) VALUES ('$(sha256sum "$SCHEMA_FILE" | cut -d' ' -f1)');
" >/dev/null

scheduled=$(psql_db "$DB_NAME" -c "SELECT count(*) FROM cron.expected_jobs")
info "$SCHEMA_FILE replayed cleanly ($scheduled cron job(s) recorded but not scheduled)"
