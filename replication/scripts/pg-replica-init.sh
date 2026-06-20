#!/bin/bash
# Boot gate for the replica: do not let postgresql-replica.service start until the
# PRIMARY's PostgreSQL is actually accepting connections.
#
# Why pg_isready and not ping: over Tailscale the host can answer ICMP before the
# tailnet route / the primary's Postgres is truly ready. pg_isready checks the real
# thing (the server is up and accepting connections).
set -euo pipefail

# Load deployment settings (PRIMARY, PRIMARY_PORT, REPL_USER, ...) with safe defaults.
CONFIG="${REPLICA_ENV:-/etc/pg-replica/replica.env}"
[ -f "$CONFIG" ] && source "$CONFIG"
: "${PRIMARY:?set PRIMARY in $CONFIG (the primary's address)}"
: "${PRIMARY_PORT:=5432}"
: "${REPL_USER:=replicator}"

echo "Waiting for primary Postgres ($PRIMARY:$PRIMARY_PORT) to accept connections..."
until pg_isready -h "$PRIMARY" -p "$PRIMARY_PORT" -U "$REPL_USER" -q; do
    sleep 3
done
echo "Primary is accepting connections."
