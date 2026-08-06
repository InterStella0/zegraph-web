#!/usr/bin/env bash
set -euo pipefail

# actions/checkout already places the exact pushed commit, and pulling on its
# detached HEAD would fail.
if [[ -z "${GITHUB_ACTIONS:-}" ]]; then
  git pull
fi

# CI builds its own throwaway ssh config from secrets and points us at it;
# locally this is unset so the 'server' alias in ~/.ssh/config is used.
ssh_args=()
if [[ -n "${SSH_CONFIG_FILE:-}" ]]; then
  ssh_args=(-F "$SSH_CONFIG_FILE")
fi

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/build-meta.sh"

docker compose -f compose.yaml build
docker compose -f compose.yaml push
if ! ssh "${ssh_args[@]}" -o BatchMode=yes -o ConnectTimeout=10 server true; then
  echo "error: 'server' is not reachable over ssh — aborting before upload" >&2
  exit 1
fi

scp "${ssh_args[@]}" .env server:~/gfl-ze-watcher/.env
ssh "${ssh_args[@]}" server 'cd ~/gfl-ze-watcher && git pull && bash ./deployment/deploy-swarm.sh'
