#!/usr/bin/env bash
# Publish an open-only commit to upstream (public engenty/engenty) and sync engenty-pro.
#
# Usage (from engenty-pro):
#   pnpm push                  # publish HEAD (not merge commits)
#   pnpm push --commit abc     # publish a specific commit
#   pnpm push --dry-run        # validate only
#   pnpm push --no-sync        # push upstream only (skip origin merge/push)
#   pnpm push --verify         # run fix/lint/typecheck/build/test before publish
#
# Closed-only work: git push origin main (do not use this script).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
PUBLISH_BRANCH="_engenty_publish_open"

COMMIT="HEAD"
DRY_RUN=0
NO_SYNC=0
VERIFY=0

# The open/closed boundary lives in ONE place — scripts/lib/closed-paths.mjs —
# because this list, EXCLUDES in publish-open-snapshot.sh, and the plugin slugs
# used to be maintained by hand and drifted. Prefix match, as before.
CLOSED_PREFIXES=()
while IFS= read -r _prefix; do
  [[ -n "$_prefix" ]] && CLOSED_PREFIXES+=("$_prefix")
done < <(node "$ROOT/scripts/lib/closed-paths.mjs")
if [[ ${#CLOSED_PREFIXES[@]} -eq 0 ]]; then
  echo "Could not read scripts/lib/closed-paths.mjs — refusing to publish." >&2
  exit 1
fi

usage() {
  cat <<'EOF'
Publish an open-only commit to upstream (public engenty/engenty) and sync engenty-pro.

Usage (from engenty-pro):
  pnpm push                  # publish HEAD
  pnpm push --commit abc     # publish a specific commit
  pnpm push --dry-run        # validate only
  pnpm push -- --no-sync     # push upstream only (skip origin merge/push)
  pnpm push -- --verify      # run fix/lint/typecheck/build/test before publish

Closed-only work: git push origin main (do not use this script).
EOF
}

log() {
  printf '%s\n' "$*"
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

is_merge_commit() {
  local commit="$1"
  [[ "$(git cat-file -p "$commit" | awk '/^parent / { count++ } END { print count+0 }')" -gt 1 ]]
}

resolve_commit_ref() {
  local ref="$1"
  local resolved
  resolved="$(git rev-parse --verify "${ref}^{commit}")"
  if [[ "$ref" == "HEAD" ]] && is_merge_commit "$resolved"; then
    fail "HEAD is a merge commit. Pass --commit <sha> for the open commit to publish."
  fi
  printf '%s\n' "$resolved"
}

commit_changed_files() {
  local commit="$1"
  if is_merge_commit "$commit"; then
    git diff-tree -m --no-commit-id --name-only -r "$commit" | sort -u
  else
    git diff-tree --no-commit-id --name-only -r "$commit"
  fi
}

is_on_upstream() {
  local commit="$1"
  git merge-base --is-ancestor "$commit" "$UPSTREAM_REMOTE/$TARGET_BRANCH" 2>/dev/null
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit)
      [[ $# -ge 2 ]] || fail "Missing value for --commit"
      COMMIT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-sync)
      NO_SYNC=1
      shift
      ;;
    --verify)
      VERIFY=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1 (try --help)"
      ;;
  esac
done

assert_engenty_pro() {
  git remote get-url "$ORIGIN_REMOTE" >/dev/null 2>&1 ||
    fail "Missing git remote '$ORIGIN_REMOTE'."
  git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1 ||
    fail "Missing git remote '$UPSTREAM_REMOTE' (public engenty/engenty)."

  local origin_url
  origin_url="$(git remote get-url "$ORIGIN_REMOTE")"
  if [[ "$origin_url" != *engenty-pro* ]]; then
    fail "pnpm push must run from engenty-pro (origin → engenty/engenty-pro)."
  fi
}

is_closed_path() {
  local path="$1"
  local prefix
  for prefix in "${CLOSED_PREFIXES[@]}"; do
    if [[ "$path" == "$prefix" || "$path" == "$prefix/"* ]]; then
      return 0
    fi
  done
  return 1
}

is_open_path() {
  local path="$1"

  if is_closed_path "$path"; then
    return 1
  fi

  if git cat-file -e "$UPSTREAM_REMOTE/$TARGET_BRANCH:$path" 2>/dev/null; then
    return 0
  fi

  case "$path" in
    apps/core | apps/core/* | apps/ui | apps/ui/* | apps/ai | apps/ai/* | apps/docs | apps/docs/* | apps/www | apps/www/* | apps/ports.config.mjs)
      return 0
      ;;
    packages/* | modules/* | patches | patches/* | scripts | scripts/* | .github | .github/* | docs | docs/* | deploy | deploy/* | e2e | e2e/*)
      return 0
      ;;
  esac

  # Root-level repo files (package.json, turbo.json, LICENSE, …).
  if [[ "$path" != */* ]]; then
    return 0
  fi

  return 1
}

validate_open_commit() {
  local commit="$1"
  local path
  local -a changed_files=()
  local -a closed_files=()

  while IFS= read -r path; do
    [[ -n "$path" ]] && changed_files+=("$path")
  done < <(commit_changed_files "$commit")

  [[ ${#changed_files[@]} -gt 0 ]] ||
    fail "Commit $commit does not change any files."

  for path in "${changed_files[@]}"; do
    if ! is_open_path "$path"; then
      closed_files+=("$path")
    fi
  done

  if [[ ${#closed_files[@]} -gt 0 ]]; then
    fail "Commit touches closed paths (use 'git push origin $TARGET_BRANCH' instead):" \
      "$(printf '\n  - %s' "${closed_files[@]}")"
  fi
}

run_verify() {
  log "Running quality gates (lockfile → fix → lint → typecheck → build → test)..."
  pnpm lockfile:check
  pnpm fix
  pnpm lint
  pnpm typecheck
  pnpm build
  pnpm test
}

publish_commit() {
  local commit="$1"
  local saved_branch
  local publish_tip
  local pick_status=0

  saved_branch="$(git rev-parse --abbrev-ref HEAD)"
  publish_tip="$(git rev-parse "$commit")"

  if is_on_upstream "$publish_tip"; then
    log "Commit $publish_tip is already on $UPSTREAM_REMOTE/$TARGET_BRANCH — skipping publish."
    return 0
  fi

  cleanup_publish() {
    git cherry-pick --abort >/dev/null 2>&1 || true
    git checkout "$saved_branch" >/dev/null 2>&1 || true
    git branch -D "$PUBLISH_BRANCH" >/dev/null 2>&1 || true
  }
  trap cleanup_publish EXIT

  log "Publishing $publish_tip to $UPSTREAM_REMOTE/$TARGET_BRANCH..."

  git checkout -B "$PUBLISH_BRANCH" "$UPSTREAM_REMOTE/$TARGET_BRANCH"

  set +e
  git cherry-pick "$publish_tip"
  pick_status=$?
  set -e

  if [[ "$pick_status" -ne 0 ]]; then
    if [[ -f .git/CHERRY_PICK_HEAD ]] &&
      git diff-index --quiet HEAD -- &&
      git diff-index --cached --quiet HEAD --; then
      git cherry-pick --abort >/dev/null 2>&1 || true
      log "Commit already applied on $UPSTREAM_REMOTE/$TARGET_BRANCH (empty cherry-pick)."
    else
      fail "Cherry-pick failed. Rebase your open commit onto $UPSTREAM_REMOTE/$TARGET_BRANCH and retry."
    fi
  fi

  # Public tree omits closed modules; keep engenty.plugins in sync so CI
  # `plugins:check` does not fail on pro-only slugs left in package.json.
  node scripts/strip-closed-plugins-manifest.mjs
  if ! git diff --quiet -- package.json; then
    git add package.json
    git commit -m "chore: strip closed plugins from public engenty.plugins"
    log "Stripped closed plugins from public package.json engenty.plugins."
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] Would push $publish_tip → $UPSTREAM_REMOTE/$TARGET_BRANCH"
  else
    git push "$UPSTREAM_REMOTE" "$PUBLISH_BRANCH:$TARGET_BRANCH"
  fi

  trap - EXIT
  git checkout "$saved_branch"
  git branch -D "$PUBLISH_BRANCH"
}

sync_pro() {
  local saved_branch
  saved_branch="$(git rev-parse --abbrev-ref HEAD)"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] Would merge $UPSTREAM_REMOTE/$TARGET_BRANCH into $saved_branch and push $ORIGIN_REMOTE"
    return 0
  fi

  log "Syncing $ORIGIN_REMOTE/$TARGET_BRANCH from $UPSTREAM_REMOTE/$TARGET_BRANCH..."
  git fetch "$UPSTREAM_REMOTE" "$TARGET_BRANCH"
  git merge "$UPSTREAM_REMOTE/$TARGET_BRANCH" --no-edit
  # Public strip must not disable pro-only plugins that still live on disk.
  node scripts/ensure-local-closed-plugins-manifest.mjs
  if ! git diff --quiet -- package.json; then
    git add package.json
    git commit -m "chore: restore closed plugins after public sync"
  fi
  git push "$ORIGIN_REMOTE" "$saved_branch"
}

main() {
  local publish_commit_ref

  assert_engenty_pro
  git fetch "$UPSTREAM_REMOTE" "$TARGET_BRANCH"

  publish_commit_ref="$(resolve_commit_ref "$COMMIT")"

  if [[ "$VERIFY" -eq 1 ]]; then
    run_verify
  fi

  validate_open_commit "$publish_commit_ref"

  publish_commit "$publish_commit_ref"

  if [[ "$NO_SYNC" -eq 0 ]]; then
    sync_pro
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Dry run complete — no remotes were updated."
  else
    log "Done. Open commit is on $UPSTREAM_REMOTE/$TARGET_BRANCH$([[ "$NO_SYNC" -eq 0 ]] && echo " and $ORIGIN_REMOTE/$TARGET_BRANCH is synced")."
  fi
}

main
