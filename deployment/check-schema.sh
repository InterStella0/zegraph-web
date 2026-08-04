#!/usr/bin/env bash
#
# Checks whether the live database actually matches db.sql.
#
# db.sql is hand-maintained, so it drifts. Rather than parsing it, this replays it into a throwaway
# database on the same server, then dumps the catalog of both sides and diffs them. A `-` line is
# something db.sql declares that the live database is missing; a `+` line is something the live
# database has that db.sql never mentions.
#
#   ./check-schema.sh                 # replay db.sql, diff every section
#   ./check-schema.sh --lint          # only check that db.sql is valid SQL, skip the diff
#   ./check-schema.sh columns indexes # only diff the named sections
#   ./check-schema.sh --keep          # leave the scratch database behind for poking at
#
# Sections: extensions enums columns constraints indexes views functions triggers cron

set -euo pipefail

# db.sql and .env live at the repo root, one level up from this script.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

readonly SCHEMA_FILE="db.sql"
readonly SCRATCH_DB="ze_schema_check"
readonly ALL_SECTIONS=(extensions enums columns constraints indexes views functions triggers cron)

lint_only=false
keep_scratch=false
force=false
sections=()

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m==>\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

for arg in "$@"; do
    case "$arg" in
        --lint|-l)  lint_only=true ;;
        --keep|-k)  keep_scratch=true ;;
        --force|-f) force=true ;;
        --help|-h)
            sed -n '3,16p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
            exit 0
            ;;
        -*) die "unknown flag: $arg" ;;
        *)  sections+=("$arg") ;;
    esac
done

[[ ${#sections[@]} -gt 0 ]] || sections=("${ALL_SECTIONS[@]}")

# --- connection ------------------------------------------------------------------------------

# .env holds DATABASE_URL built out of DB_HOST/DB_USERNAME/etc, so it needs `set -a` to export the
# pieces before the interpolation resolves.
if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

[[ -n "${DATABASE_URL:-}" ]] || die \
"DATABASE_URL is not set and .env did not provide one.

Point it at the database you want checked against $SCHEMA_FILE and re-run."

# psql is rarely on PATH on Windows; fall back to the newest installed version.
if [[ -z "${PSQL:-}" ]]; then
    if command -v psql >/dev/null 2>&1; then
        PSQL=psql
    else
        PSQL=$(ls -d "/c/Program Files/PostgreSQL"/*/bin/psql.exe 2>/dev/null | sort -V | tail -1)
    fi
fi
[[ -n "${PSQL:-}" && -x "$(command -v "$PSQL" || printf '%s' "$PSQL")" ]] || die \
"psql not found. Put it on PATH or set PSQL=/path/to/psql."

# The scratch database lives on the same server as the live one, so the two sides agree on server
# version and available extensions. Only the database name differs.
readonly LIVE_URL="${DATABASE_URL%%\?*}"
readonly URL_BASE="${LIVE_URL%/*}"
readonly LIVE_DB="${LIVE_URL##*/}"
readonly MAINT_URL="$URL_BASE/postgres"
readonly SCRATCH_URL="$URL_BASE/$SCRATCH_DB"

[[ "$LIVE_DB" != "$SCRATCH_DB" ]] || die "DATABASE_URL points at $SCRATCH_DB, which this script drops."

export PGOPTIONS="-c client_min_messages=warning"

psql_do() { "$PSQL" "$1" -v ON_ERROR_STOP=1 -tAq -c "$2"; }

# --- scratch database ------------------------------------------------------------------------

workdir=$(mktemp -d)
cleanup() {
    rm -rf "$workdir"
    if [[ "$keep_scratch" == true ]]; then
        warn "scratch database left behind: $SCRATCH_DB"
    else
        "$PSQL" "$MAINT_URL" -tAq -c "DROP DATABASE IF EXISTS $SCRATCH_DB" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

info "Rebuilding scratch database $SCRATCH_DB"
psql_do "$MAINT_URL" "DROP DATABASE IF EXISTS $SCRATCH_DB" >/dev/null
psql_do "$MAINT_URL" "CREATE DATABASE $SCRATCH_DB" >/dev/null

# pg_cron can only be installed on one database per cluster, so the scratch copy can never have it.
# Stubbing the schedule call lets the rest of db.sql run untouched and records what it wanted to
# schedule, which is what the `cron` section compares. The CREATE EXTENSION line is blanked in
# place rather than deleted so error line numbers still match db.sql.
psql_do "$SCRATCH_URL" "
CREATE SCHEMA cron;
CREATE TABLE cron.expected_jobs(jobname TEXT, schedule TEXT, database TEXT);
CREATE FUNCTION cron.schedule_in_database(jobname TEXT, schedule TEXT, command TEXT, database TEXT)
RETURNS BIGINT LANGUAGE sql AS \$\$
    INSERT INTO cron.expected_jobs VALUES (jobname, schedule, database) RETURNING 0::BIGINT;
\$\$;

-- The layers schema is imported by hand through QGIS, so db.sql never declares its contents and a
-- replay cannot build them. Stub just enough of countries_fixed for the countries_counted view to
-- compile; the layers schema itself is left out of the diff.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA layers;
CREATE TABLE layers.countries_fixed(\"NAME\" TEXT, \"ISO_A2_EH\" TEXT, geom geometry);" >/dev/null

sed 's/^\(CREATE EXTENSION .*pg_cron.*\)$/-- [check-schema] \1/' "$SCHEMA_FILE" > "$workdir/replay.sql"

info "Replaying $SCHEMA_FILE"
"$PSQL" "$SCRATCH_URL" -v ON_ERROR_STOP=0 -q -f "$workdir/replay.sql" > "$workdir/load.log" 2>&1 || true

# Keep the LINE/caret lines psql prints under a syntax error; they point at the offending token,
# which the statement-level line number alone does not. The path is rewritten because psql echoes
# the temp copy it was handed, not db.sql.
grep -E '^(psql:.*(ERROR|FATAL)|LINE [0-9]+:|[[:space:]]+\^)' "$workdir/load.log" |
    sed -E "s|^psql:.*replay\.sql:|$SCHEMA_FILE:|" > "$workdir/load-errors.txt" || true

load_errors=$(grep -cE 'ERROR|FATAL' "$workdir/load-errors.txt" || true)

if [[ "$load_errors" -gt 0 ]]; then
    warn "$SCHEMA_FILE did not replay cleanly ($load_errors statements failed)"
    echo
    # One bad CREATE TABLE cascades into every later reference to it, so when there is a mix, lead
    # with the errors that are not just fallout. When *every* error is a missing reference there is
    # nothing to demote — they are the real problem, usually a statement ordered after its
    # dependency — so print them all.
    awk '/ERROR|FATAL/ { keep = ($0 !~ /does not exist/) } keep' \
        "$workdir/load-errors.txt" > "$workdir/root-errors.txt" || true
    cascades=$(grep -c 'does not exist' "$workdir/load-errors.txt" || true)

    if [[ -s "$workdir/root-errors.txt" ]]; then
        printf '  root causes:\n'
        sed 's/^/    /' "$workdir/root-errors.txt"
        [[ "$cascades" -gt 0 ]] && printf '\n  knock-on failures: %s\n' "$cascades"
    else
        printf '  missing references (check the statement order in %s):\n' "$SCHEMA_FILE"
        sed 's/^/    /' "$workdir/load-errors.txt"
    fi
    echo
fi

if [[ "$lint_only" == true ]]; then
    [[ "$load_errors" -eq 0 ]] && info "$SCHEMA_FILE replays cleanly"
    exit $(( load_errors > 0 ? 1 : 0 ))
fi

if [[ "$load_errors" -gt 0 && "$force" != true ]]; then
    die "the diff below $SCHEMA_FILE would be meaningless while it fails to load.
Fix the root causes above, or pass --force to diff anyway."
fi

# --- introspection ---------------------------------------------------------------------------

# Everything an extension installed (postgis alone brings ~1000 functions) is skipped, along with
# the catalog schemas, so only objects db.sql is responsible for are compared.
readonly NOT_FROM_EXTENSION="NOT EXISTS (SELECT 1 FROM pg_depend dep
    WHERE dep.classid = '%s'::regclass AND dep.objid = %s AND dep.deptype = 'e')"
readonly OUR_SCHEMAS="n.nspname !~ '^pg_'
    AND n.nspname NOT IN ('information_schema','topology','tiger','tiger_data','cron','layers')"

section_sql() {
    case "$1" in
    extensions)
        echo "SELECT extname FROM pg_extension ORDER BY 1"
        ;;
    enums)
        printf "SELECT n.nspname||'.'||t.typname||' = ('
            ||string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)||')'
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE %s AND $(printf "$NOT_FROM_EXTENSION" pg_type t.oid)
        GROUP BY n.nspname, t.typname ORDER BY 1" "$OUR_SCHEMAS"
        ;;
    columns)
        printf "SELECT n.nspname||'.'||c.relname||'.'||a.attname
            ||' :: '||format_type(a.atttypid, a.atttypmod)
            ||CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
            ||COALESCE(' DEFAULT '||pg_get_expr(ad.adbin, ad.adrelid), '')
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','m','v')
          AND %s AND $(printf "$NOT_FROM_EXTENSION" pg_class c.oid)
        ORDER BY 1" "$OUR_SCHEMAS"
        ;;
    constraints)
        # contype 'n' is the not-null constraint PG 18 records per column; the columns section
        # already reports those.
        printf "SELECT n.nspname||'.'||c.relname||': '||con.conname||' '||pg_get_constraintdef(con.oid)
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype <> 'n'
          AND %s AND $(printf "$NOT_FROM_EXTENSION" pg_class c.oid)
        ORDER BY 1" "$OUR_SCHEMAS"
        ;;
    indexes)
        # Indexes that merely back a constraint show up in the constraints section already.
        printf "SELECT pg_get_indexdef(i.indexrelid)
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE %s AND $(printf "$NOT_FROM_EXTENSION" pg_class c.oid)
          AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid)
        ORDER BY 1" "$OUR_SCHEMAS"
        ;;
    views)
        printf "SELECT '-- '||CASE c.relkind WHEN 'm' THEN 'materialized view' ELSE 'view' END
            ||' '||n.nspname||'.'||c.relname||chr(10)||pg_get_viewdef(c.oid, true)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('v','m')
          AND %s AND $(printf "$NOT_FROM_EXTENSION" pg_class c.oid)
        ORDER BY n.nspname, c.relname" "$OUR_SCHEMAS"
        ;;
    functions)
        printf "SELECT pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prokind = 'f'
          AND %s AND $(printf "$NOT_FROM_EXTENSION" pg_proc p.oid)
        ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)" "$OUR_SCHEMAS"
        ;;
    triggers)
        printf "SELECT pg_get_triggerdef(t.oid)
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
          AND %s AND $(printf "$NOT_FROM_EXTENSION" pg_class c.oid)
        ORDER BY 1" "$OUR_SCHEMAS"
        ;;
    *) die "unknown section: $1" ;;
    esac
}

# The cron section is asymmetric: the scratch side reads what db.sql asked to schedule, the live
# side reads what pg_cron actually has (nothing at all, if the extension is not installed).
cron_sql() {
    case "$1" in
    scratch) echo "SELECT jobname||' :: '||schedule FROM cron.expected_jobs ORDER BY 1" ;;
    live)    echo "SELECT jobname||' :: '||schedule FROM cron.job
                   WHERE database = current_database() ORDER BY 1" ;;
    esac
}

dump_section() {
    local url=$1 section=$2 out=$3 sql
    if [[ "$section" == cron ]]; then
        [[ "$url" == "$SCRATCH_URL" ]] && sql=$(cron_sql scratch) || sql=$(cron_sql live)
        # No pg_cron on this database means no jobs, which is exactly what we want to report.
        "$PSQL" "$url" -tAq -c "$sql" > "$out" 2>/dev/null || : > "$out"
        return
    fi
    sql=$(section_sql "$section")
    "$PSQL" "$url" -v ON_ERROR_STOP=1 -tAq -c "$sql" > "$out"
}

# --- diff ------------------------------------------------------------------------------------

info "Comparing $LIVE_DB against $SCHEMA_FILE"
echo

drifted=()
for section in "${sections[@]}"; do
    dump_section "$SCRATCH_URL" "$section" "$workdir/$section.expected"
    dump_section "$LIVE_URL"    "$section" "$workdir/$section.actual"

    if diff -u --label "$SCHEMA_FILE ($section)" --label "$LIVE_DB ($section)" \
         "$workdir/$section.expected" "$workdir/$section.actual" > "$workdir/$section.diff"; then
        printf '  \033[1;32mok\033[0m       %s\n' "$section"
    else
        local_count=$(grep -cE '^[-+][^-+]' "$workdir/$section.diff" || true)
        printf '  \033[1;31mdrift\033[0m    %-12s %s line(s)\n' "$section" "$local_count"
        drifted+=("$section")
    fi
done

if [[ ${#drifted[@]} -eq 0 ]]; then
    echo
    info "No drift: the database matches $SCHEMA_FILE"
    exit 0
fi

for section in "${drifted[@]}"; do
    printf '\n\033[1m--- %s ---\033[0m\n' "$section"
    cat "$workdir/$section.diff"
done

echo
warn "drift in: ${drifted[*]}"
warn "'-' lines are in $SCHEMA_FILE but missing from the database; '+' lines are the reverse."
exit 1
