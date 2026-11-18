#!/usr/bin/env bash
# Each Actions step owns its preview process and fails explicitly on startup.
set -euo pipefail
: "${RELEASE_ID:?RELEASE_ID is required}"
: "${PLAYWRIGHT_BASE_URL:?PLAYWRIGHT_BASE_URL is required}"
node scripts/preview-release.mjs ".release-artifacts/$RELEASE_ID" 5194 &
preview_pid=$!
trap 'kill "$preview_pid" 2>/dev/null || true; wait "$preview_pid" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
  kill -0 "$preview_pid" || { echo 'Release preview exited before readiness' >&2; exit 1; }
  if curl --fail --silent "$PLAYWRIGHT_BASE_URL/" > /dev/null; then break; fi
  sleep 1
done
curl --fail --silent "$PLAYWRIGHT_BASE_URL/" > /dev/null
for arg in "$@"; do
  if [[ "$arg" == --output=* ]]; then
    export PLAYWRIGHT_HTML_OUTPUT_DIR="test-results/reports/${arg##*/}"
  fi
done
# env accepts command-scoped Firefox software rendering variables.
env "$@"
