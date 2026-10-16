#!/usr/bin/env bash
set -euo pipefail

# actions/checkout already places the exact pushed commit, and pulling on its
# detached HEAD would fail.
if [[ -z "${GITHUB_ACTIONS:-}" ]]; then
  git pull
fi

# Dokploy owns the deploy: it keeps the runtime .env and runs `docker stack deploy` for the ze
# stack from compose-swarm.yaml on main. CI passes these in from repository variables and
# secrets; locally, export them yourself.
: "${DOKPLOY_URL:?DOKPLOY_URL is not set}"
: "${DOKPLOY_API_KEY:?DOKPLOY_API_KEY is not set}"
: "${DOKPLOY_COMPOSE_ID:?DOKPLOY_COMPOSE_ID is not set}"

dokploy() {
  curl -fsS --max-time 30 -H "x-api-key: $DOKPLOY_API_KEY" "$@"
}

deployments() {
  dokploy "$DOKPLOY_URL/api/deployment.allByCompose?composeId=$DOKPLOY_COMPOSE_ID"
}

# Newest deployment id, empty when the compose has never been deployed.
latest_deployment() {
  deployments | jq -r 'if length == 0 then empty else max_by(.createdAt).deploymentId end'
}

# Probe before building, so a Dokploy problem fails in seconds instead of after the build.
if ! deploy_command=$(dokploy "$DOKPLOY_URL/api/compose.getDefaultCommand?composeId=$DOKPLOY_COMPOSE_ID" | jq -r .); then
  echo "error: cannot read the compose from Dokploy at $DOKPLOY_URL (unreachable, bad API key, or" \
    "wrong DOKPLOY_COMPOSE_ID) — aborting before build" >&2
  exit 1
fi
# Dokploy suffixes its app names, so only the custom command keeps the stack named `ze`. Without it
# a deploy would start a second stack next to the live one instead of updating it.
if [[ "$deploy_command" != *"stack deploy -c ./compose-swarm.yaml ze "* ]]; then
  echo "error: Dokploy no longer deploys this compose as the stack \`ze\` (command: $deploy_command) — aborting" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/build-meta.sh"

docker compose -f compose.yaml build
docker compose -f compose.yaml push

# compose.deploy only queues the job, and the deployment row appears once Dokploy's worker picks
# it up. Remember the newest one first and wait for a different one, or we would end up
# watching the previous deploy.
previous=$(latest_deployment)
dokploy -X POST "$DOKPLOY_URL/api/compose.deploy" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg id "$DOKPLOY_COMPOSE_ID" --arg title "Deploy ${BUILD_COMMIT:0:7}" \
    '{composeId: $id, title: $title}')" > /dev/null

deadline=$((SECONDS + 20 * 60))
deployment=""
while (( SECONDS < deadline )); do
  current=$(latest_deployment || true)
  if [[ -n "$current" && "$current" != "$previous" ]]; then
    deployment=$current
    break
  fi
  sleep 5
done
if [[ -z "$deployment" ]]; then
  echo "error: Dokploy never started the deployment" >&2
  exit 1
fi

# The stack deploy runs with --detach=false, so `done` means every service converged, and a paused
# or rolled-back update ends as `error`. A Dokploy restart mid-deploy marks it `cancelled`.
echo "following Dokploy deployment $deployment"
while (( SECONDS < deadline )); do
  status=$(deployments | jq -r --arg id "$deployment" '.[] | select(.deploymentId == $id) | .status' || true)
  case "$status" in
    done)
      echo "deployed"
      exit 0
      ;;
    error | cancelled)
      echo "error: Dokploy deployment $deployment ended as $status — its log is in Dokploy" >&2
      exit 1
      ;;
  esac
  sleep 10
done
echo "error: timed out waiting for Dokploy deployment $deployment" >&2
exit 1
