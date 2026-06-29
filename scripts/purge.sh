#!/usr/bin/env bash
# Reset the workspace to a fresh-checkout-like state (local env, generated artifacts, caches).
# Usage: pnpm purge [-- --yes] [-- --light] [-- --quiet]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AUTO_YES=false
LIGHT=false
QUIET=false
WORKSPACE_DIRS=(apps packages modules docs)

for arg in "$@"; do
  case "$arg" in
    --)
      ;;
    --yes | -y)
      AUTO_YES=true
      ;;
    --light)
      LIGHT=true
      ;;
    --quiet | -q)
      QUIET=true
      ;;
    --help | -h)
      cat <<'EOF'
Usage: pnpm purge [-- --yes] [-- --light] [-- --quiet]

Removes local dependencies, build caches, generated setup files, and dev env files
so the tree matches a fresh clone before `pnpm install` + `pnpm engenty setup --local`.

Options:
  --yes, -y     Skip confirmation prompt
  --light       Skip node_modules (faster — env + generated setup + build caches only)
  --quiet, -q   Minimal output (summary only, no path listing)

Also: pnpm purge:light  (= purge --light)

Does not stop or reset the local Supabase Docker stack — run `pnpm db:reset` after
setup if you also want a clean database.
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

log() {
  if [[ "$QUIET" != true ]]; then
    echo "$@"
  fi
}

remove_if_exists() {
  local path
  for path in "$@"; do
    if [[ -e "$path" ]]; then
      rm -rf "$path"
    fi
  done
}

remove_glob() {
  shopt -s nullglob
  local matches=($1)
  shopt -u nullglob
  if ((${#matches[@]} > 0)); then
    rm -rf "${matches[@]}"
  fi
}

workspace_find_names=(dist .turbo .next coverage)
if [[ "$LIGHT" != true ]]; then
  workspace_find_names=(node_modules "${workspace_find_names[@]}")
fi

has_env_files() {
  find . \
    \( -path ./node_modules -o -path ./.git \) -prune -o \
    \( -name ".env" -o -name ".env.*" \) ! -name "*.example" -print -quit 2>/dev/null | grep -q .
}

has_workspace_hits() {
  local dir name_expr=""
  local first=true
  for dir in "${WORKSPACE_DIRS[@]}"; do
    [[ -d "$dir" ]] || continue
    first=true
    name_expr=""
    for name in "${workspace_find_names[@]}"; do
      if [[ "$first" == true ]]; then
        first=false
        name_expr="-name $(printf '%q' "$name")"
      else
        name_expr="$name_expr -o -name $(printf '%q' "$name")"
      fi
    done
    if find "$dir" \( $name_expr \) -type d -prune -print -quit 2>/dev/null | grep -q .; then
      return 0
    fi
    if find "$dir" -name "*.tsbuildinfo" -type f -print -quit 2>/dev/null | grep -q .; then
      return 0
    fi
  done
  return 1
}

has_migration_sql() {
  shopt -s nullglob
  local mig=(supabase/migrations/*.sql)
  shopt -u nullglob
  ((${#mig[@]} > 0))
}

would_purge=false

path_exists() {
  [[ -e "$1" ]]
}

# Coarse "anything to do?" check without deleting
for candidate in \
  supabase/config.toml \
  apps/ui/src/plugins/generated-catalog.ts \
  apps/ui/src/plugins/generated-tailwind-sources.css \
  supabase/snapshots \
  data tmp logs .sync \
  .turbo coverage node_modules; do
  if path_exists "$candidate"; then
    would_purge=true
    break
  fi
done

if [[ "$would_purge" != true ]] && has_migration_sql; then
  would_purge=true
fi

if [[ "$would_purge" != true ]] && has_env_files; then
  would_purge=true
fi

if [[ "$would_purge" != true ]] && has_workspace_hits; then
  would_purge=true
fi

if [[ "$would_purge" != true ]]; then
  echo "Nothing to purge — workspace already looks like a fresh checkout (before install)."
  exit 0
fi

log "pnpm purge will permanently delete:"
log ""

if [[ "$QUIET" == true ]]; then
  log "  • generated setup, local env files, runtime dirs, build caches"
  if [[ "$LIGHT" == true ]]; then
    log "  • node_modules: skipped (--light)"
  else
    log "  • node_modules (root + workspaces)"
  fi
else
  log "  • generated setup (supabase/config.toml, migrations aggregate, UI catalog, snapshots)"
  log "  • local env files (excluding *.example templates)"
  log "  • runtime dirs (data/, tmp/, logs/, .sync/)"
  log "  • build caches (dist, .turbo, .next, coverage, *.tsbuildinfo) under apps/, packages/, modules/, docs/"
  if [[ "$LIGHT" == true ]]; then
    log "  • node_modules: skipped (--light)"
  else
    log "  • node_modules (root + workspace packages)"
  fi
fi

log ""
log "Committed templates (.env.example, supabase/config.toml.example) are kept."
log "Local Supabase Docker data is not removed — run pnpm db:reset after setup if you need a clean database."
log ""

if [[ "$AUTO_YES" != true ]]; then
  read -r -p "Continue? [y/N] " reply
  case "$reply" in
    y | Y | yes | YES)
      ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

echo "Purging..."

# Generated Supabase + UI setup (gitignored)
remove_if_exists \
  supabase/config.toml \
  apps/ui/src/plugins/generated-catalog.ts \
  apps/ui/src/plugins/generated-tailwind-sources.css \
  supabase/snapshots
remove_glob "supabase/migrations/*.sql"

# Local env files (keep committed *.example templates)
while IFS= read -r -d '' env_file; do
  rm -f "$env_file"
done < <(
  find . \
    \( -path ./node_modules -o -path ./.git \) -prune -o \
    \( -name ".env" -o -name ".env.*" \) ! -name "*.example" -print0 2>/dev/null
)

# Workspace-local runtime data
remove_if_exists data tmp logs .sync

# Root caches (+ node_modules unless --light)
remove_if_exists .turbo coverage
if [[ "$LIGHT" != true ]]; then
  remove_if_exists node_modules
fi

# Workspace build caches (batched find -exec, same pattern as scripts/clean.sh)
for dir in "${WORKSPACE_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  for name in "${workspace_find_names[@]}"; do
    find "$dir" -name "$name" -type d -prune -exec rm -rf {} + 2>/dev/null || true
  done
  find "$dir" -name "*.tsbuildinfo" -type f -delete 2>/dev/null || true
done

if [[ "$LIGHT" == true ]]; then
  cat <<'EOF'

Purge complete (light — node_modules kept).

Next:
  pnpm engenty setup --local   # plugins (interactive) + Supabase + migrations + .env.local
  pnpm dev
EOF
else
  cat <<'EOF'

Purge complete.

Next (same as a new checkout):
  pnpm install
  pnpm engenty setup --local   # plugins (interactive) + Supabase + migrations + .env.local
  pnpm dev
EOF
fi
