#!/usr/bin/env bash
set -euo pipefail

# actions/checkout already places the exact pushed commit, and pulling on its
# detached HEAD would fail.
if [[ -z "${GITHUB_ACTIONS:-}" ]]; then
  git pull
fi

docker compose -f compose.yaml build
docker compose -f compose.yaml push
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 server true; then
  echo "error: 'server' is not reachable over ssh — aborting before upload" >&2
  exit 1
fi

scp .env server:~/gfl-ze-watcher/.env
ssh server 'cd ~/gfl-ze-watcher && git pull && bash ./deployment/deploy-swarm.sh'