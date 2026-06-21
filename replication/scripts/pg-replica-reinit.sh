#!/bin/bash
# Rebuild the replica from the primary with a fresh base backup.
#
# Triggered automatically (via OnFailure= on postgresql-replica.service) only when
# the replica can no longer recover by streaming — e.g. after a power-off long
# enough that the primary has discarded the WAL the replica still needs (bounded by
# max_slot_wal_keep_size on the primary).
#
# Two safety properties that make this reliable over a flaky/high-latency link:
#   1. Retries the WHOLE base backup until it completes, so a dropped connection
#      mid-transfer does not leave the system stuck/failed.
#   2. Builds into a TEMP dir and swaps it in only on success, so an interrupted
#      rebuild never leaves an empty/broken data directory.
#
# Note: this script does NOT write postgresql.conf / pg_hba.conf. Those live in
# $CONFDIR (outside the data dir) and survive every rebuild.
set -euo pipefail

# Load deployment settings with safe defaults.
CONFIG="${REPLICA_ENV:-/etc/pg-replica/replica.env}"
[ -f "$CONFIG" ] && source "$CONFIG"
: "${PRIMARY:?set PRIMARY in $CONFIG to the primary address}"
: "${PRIMARY_PORT:=5432}"
: "${REPL_USER:=replicator}"
: "${SLOT:=replica_pc}"
: "${PGDATA:=/var/lib/postgres/replica}"

NEWDATA="${PGDATA}.new"
OLDDATA="${PGDATA}.old"

echo "Replica failed — rebuilding from primary (safe, with retries)..."

# Wait until the primary actually accepts connections.
until pg_isready -h "$PRIMARY" -p "$PRIMARY_PORT" -U "$REPL_USER" -q; do
    echo "Primary not ready, waiting..."
    sleep 5
done

# Retry the full base backup until it succeeds. Each attempt is fresh into a temp
# dir; the live data dir is left untouched until a complete backup exists.
until
    rm -rf "$NEWDATA"
    mkdir -p "$NEWDATA"
    chmod 700 "$NEWDATA"
    # Reset the replication slot first: after a long downtime it may be invalidated
    # (the primary's WAL cap was exceeded). It is inactive now because the replica is
    # down, so it can be dropped; pg_basebackup -C recreates it during the backup.
    psql "host=$PRIMARY port=$PRIMARY_PORT user=$REPL_USER dbname=postgres" -c \
        "SELECT pg_drop_replication_slot('$SLOT') FROM pg_replication_slots WHERE slot_name='$SLOT';" \
        || true
    # -P progress, -Xs stream WAL during backup, -R write standby.signal +
    # postgresql.auto.conf (primary_conninfo/slot), -C create the slot.
    pg_basebackup \
        -h "$PRIMARY" -p "$PRIMARY_PORT" -U "$REPL_USER" \
        -D "$NEWDATA" \
        -P -Xs -R -C --slot="$SLOT"
do
    echo "Backup interrupted (network?), retrying in 15s..."
    sleep 15
done

# Backup complete — swap it into place. An interrupt before this point leaves the
# old data dir intact; an interrupt during the swap leaves a recoverable .old copy.
rm -rf "$OLDDATA"
[ -d "$PGDATA" ] && mv "$PGDATA" "$OLDDATA"
mv "$NEWDATA" "$PGDATA"
chmod 700 "$PGDATA"
rm -rf "$OLDDATA"

echo "Rebuild complete."
