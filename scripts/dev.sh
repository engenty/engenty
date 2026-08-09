#!/usr/bin/env bash
# Port-based dev (the non-Portless path). Exists only so the open-file limit can
# be raised before Turbo starts — a package.json script has no way to do that.
#
# `exec`s Turbo so signal handling and exit codes are exactly as they were when
# this ran straight from package.json. Extra arguments are passed through.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./dev-open-file-limit.sh
source "$ROOT/scripts/dev-open-file-limit.sh"
raise_open_file_limit

exec pnpm exec turbo run api:app dev:app studio "--filter=./apps/*" "$@"
