#!/usr/bin/env bash
# Deploy the stack to Docker Swarm from the manager (the VPS).
#
# Why this script exists: `docker stack deploy` does NOT read .env the way
# `docker compose` does. It only interpolates ${VAR} from the shell
# environment, so without this every ${MAPS_PATH}, ${DB_HOST}, etc. would
# resolve to empty and silently break mounts / DB connectivity. We load .env
# into the environment first, then deploy.
#
# Run this ON THE VPS (the swarm manager), from the repo root:
#   ./deployment/deploy-swarm.sh
set -euo pipefail
# .env and compose-swarm.yaml live at the repo root, one level up from here.
cd "$(dirname "$0")/.."

if [[ ! -f ./.env ]]; then
  echo "error: .env not found in $(pwd) — refusing to deploy with empty vars" >&2
  exit 1
fi

# Export every var defined while -a is on, so .env values become available
# for ${VAR} interpolation in compose-swarm.yaml, then turn auto-export off.
set -a
. ./.env
set +a

# "ze" is the stack name (namespace): services become ze_backend, ze_qgis-server, ...
#   --with-registry-auth ships your Docker Hub creds so workers can pull private images
#   --prune removes services that were deleted from the compose file
docker stack deploy \
  -c compose-swarm.yaml \
  --with-registry-auth \
  --prune \
  ze
