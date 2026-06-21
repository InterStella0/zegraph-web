#!/bin/bash
# Install the PostgreSQL replica auto-recovery system on this machine.
# Run as root from inside the repo:  sudo ./install.sh
#
# Idempotent: safe to re-run after editing config/replica.env or any file.
# Does NOT start the rebuild — see the printed next step.
set -euo pipefail

# Resolve the directory this script lives in, so it works from any CWD.
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFDIR="/var/lib/postgres/replica-conf"
ENVDIR="/etc/pg-replica"

# Postgres OS user differs by distro (Arch: postgres; Debian/Ubuntu: postgres too,
# but data lives elsewhere). Override with: PGUSER=postgres sudo -E ./install.sh
PG_OS_USER="${PG_OS_USER:-postgres}"

echo "==> Stopping/clearing any existing units (ignore 'not loaded' errors)"
systemctl stop postgresql-replica.service pg-replica-reinit.service 2>/dev/null || true
systemctl reset-failed postgresql-replica.service pg-replica-reinit.service 2>/dev/null || true

echo "==> Installing deployment settings to $ENVDIR/replica.env"
mkdir -p "$ENVDIR"
install -o root -g root -m 644 "$SRC/config/replica.env" "$ENVDIR/replica.env"

echo "==> Installing static Postgres config to $CONFDIR (owned by $PG_OS_USER)"
mkdir -p "$CONFDIR"
install -o "$PG_OS_USER" -g "$PG_OS_USER" -m 600 "$SRC/config/postgresql.conf" "$CONFDIR/postgresql.conf"
install -o "$PG_OS_USER" -g "$PG_OS_USER" -m 600 "$SRC/config/pg_hba.conf"     "$CONFDIR/pg_hba.conf"
install -o "$PG_OS_USER" -g "$PG_OS_USER" -m 600 "$SRC/config/pg_ident.conf"   "$CONFDIR/pg_ident.conf"
chown "$PG_OS_USER":"$PG_OS_USER" "$CONFDIR"
chmod 700 "$CONFDIR"

echo "==> Installing scripts to /usr/local/bin (root-owned, executable)"
install -o root -g root -m 755 "$SRC/scripts/pg-replica-init.sh"   /usr/local/bin/pg-replica-init.sh
install -o root -g root -m 755 "$SRC/scripts/pg-replica-reinit.sh" /usr/local/bin/pg-replica-reinit.sh

echo "==> Installing systemd units to /etc/systemd/system"
install -o root -g root -m 644 "$SRC/systemd/postgresql-replica.service" /etc/systemd/system/postgresql-replica.service
install -o root -g root -m 644 "$SRC/systemd/pg-replica-init.service"    /etc/systemd/system/pg-replica-init.service
install -o root -g root -m 644 "$SRC/systemd/pg-replica-reinit.service"  /etc/systemd/system/pg-replica-reinit.service

echo "==> Reloading systemd and enabling boot-time units"
systemctl daemon-reload
systemctl enable postgresql-replica.service pg-replica-init.service >/dev/null

cat <<EOF

Install complete. Nothing has been started yet.

First-time bootstrap (downloads a full base backup from the primary):
    sudo systemctl start pg-replica-reinit.service
    journalctl -u pg-replica-reinit -f          # watch progress

Once it finishes it auto-starts the replica. Verify with:
    systemctl is-active postgresql-replica
    psql -p 5433 -At -c "SELECT pg_is_in_recovery();"                       # -> t
    psql -p 5433 -xc "SELECT status, sender_host FROM pg_stat_wal_receiver;" # -> streaming
EOF
