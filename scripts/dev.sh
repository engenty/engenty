#!/usr/bin/env bash
# Port-based dev (the non-Portless path). Exists only so the open-file limit can
# be raised before Turbo starts — a package.json script has no way to do that.
#
# `exec`s Turbo so signal handling and exit codes are exactly as they were when
# this ran straight from package.json. Extra arguments are passed through.
#
# Mastra Studio is OFF by default (`--studio` to add it): it is a second dev
# server most runs never look at, and idle dev processes are not free when
# several checkouts are up at once.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./dev-open-file-limit.sh
source "$ROOT/scripts/dev-open-file-limit.sh"
raise_open_file_limit

TURBO_TASKS=(api:app dev:app)
ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--studio" ]]; then
    TURBO_TASKS+=(studio)
  else
    ARGS+=("$arg")
  fi
done

# `${ARGS[@]+…}` guards the empty-array case: under `set -u`, bash 3.2 (what
# macOS ships as /bin/bash) treats "${ARGS[@]}" on an empty array as unbound.
exec pnpm exec turbo run "${TURBO_TASKS[@]}" "--filter=./apps/*" ${ARGS[@]+"${ARGS[@]}"}
