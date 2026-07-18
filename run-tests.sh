#!/usr/bin/env bash
#
# Runs the backend test suite.
#
# The tests themselves need no Postgres and no redis, but the sqlx query! macros are checked at
# compile time, so *building* them needs either a live database or the generated .sqlx/ cache.
# That cache is gitignored, so a fresh clone has to build it once. This script does that for you
# when it is missing, then runs the tests offline.
#
#   ./run-tests.sh                  # prepare if needed, then test
#   ./run-tests.sh --prepare        # force-regenerate the cache first (do this after editing a query!)
#   ./run-tests.sh workers::        # any extra args go to cargo test
#   ./run-tests.sh -- --nocapture   # everything after -- goes to the test binary

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

readonly SQLX_DIR=".sqlx"
force_prepare=false
cargo_args=()

for arg in "$@"; do
    case "$arg" in
        --prepare|-p) force_prepare=true ;;
        --help|-h)
            sed -n '3,14p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
            exit 0
            ;;
        *) cargo_args+=("$arg") ;;
    esac
done

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m==>\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

# Regenerating needs a real database; running the tests does not.
prepare_cache() {
    info "Regenerating the sqlx query cache (this needs a live database)"

    command -v cargo-sqlx >/dev/null 2>&1 || die \
"sqlx-cli is not installed. Install it with:

    cargo install sqlx-cli --no-default-features --features postgres,rustls"

    # .env holds DATABASE_URL built out of DB_HOST/DB_USERNAME/etc, so it needs `set -a` to export
    # the pieces before the interpolation resolves.
    if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
        info "Reading DATABASE_URL from .env"
        set -a
        # shellcheck disable=SC1091
        source .env
        set +a
    fi

    [[ -n "${DATABASE_URL:-}" ]] || die \
"DATABASE_URL is not set and .env did not provide one.

Point it at any Postgres carrying this schema (see db.sql) and re-run."

    # --all-targets matters: without it the test target's queries are left out of the cache and the
    # very next `cargo test` fails on them.
    if ! cargo sqlx prepare -- --all-targets; then
        die \
"Could not reach the database to regenerate the cache.

The dev database is on the LAN and is not always up. Either bring it up, or point DATABASE_URL at a
throwaway instance seeded from db.sql:

    docker run -d --name ze-prepare -e POSTGRES_PASSWORD=x -p 55432:5432 postgis/postgis:16-3.4
    psql postgres://postgres:x@localhost:55432/postgres -f db.sql
    DATABASE_URL=postgres://postgres:x@localhost:55432/postgres ./run-tests.sh --prepare"
    fi

    # `cargo sqlx prepare` leaves unrelated files alone, but recreate this in case that changes —
    # the directory has to survive in git for the cache to have somewhere to land.
    touch "$SQLX_DIR/.gitkeep"
}

if [[ "$force_prepare" == true ]]; then
    prepare_cache
elif ! compgen -G "$SQLX_DIR/query-*.json" >/dev/null; then
    warn "No query cache found — building it once before the tests can compile."
    prepare_cache
fi

info "Running tests (offline: no database or redis required)"

# DATABASE_URL is unset rather than merely ignored, so a stale or unreachable value cannot influence
# the build and the run genuinely proves the suite needs no live services.
env -u DATABASE_URL SQLX_OFFLINE=true cargo test --all-targets "${cargo_args[@]}"
