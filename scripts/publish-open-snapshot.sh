#!/usr/bin/env bash
# Snapshot-publish the OPEN subset of a commit to the public repo (engenty/engenty).
#
# Unlike publish-open.sh (which cherry-picks one open commit at a time), this
# replaces the public branch's tree wholesale with <source>'s tree minus the
# closed/excluded paths, as a single commit on top of the public branch. Use it
# to publish a release or to reconcile after drift — the public repo is a
# filtered snapshot, not a commit-for-commit mirror.
#
# Usage:
#   bash scripts/publish-open-snapshot.sh [source]
#     source            git ref whose tree to publish (default: origin/main)
#   env:
#     PUBLIC_REMOTE     git remote for engenty/engenty (default: upstream)
#     PUBLIC_BRANCH     branch to publish to (default: main)
#     MESSAGE           commit message (default: "chore: sync open source")
#     DRY_RUN=1         build + safety-check, but don't push
#
# The CI wrapper (.github/workflows/publish-open.yml) adds a token-authed remote
# and calls this on every v* tag.
set -euo pipefail

SOURCE="${1:-origin/main}"
PUBLIC_REMOTE="${PUBLIC_REMOTE:-upstream}"
PUBLIC_BRANCH="${PUBLIC_BRANCH:-main}"
MESSAGE="${MESSAGE:-chore: sync open source}"
DRY_RUN="${DRY_RUN:-0}"

# Paths that must NEVER land on the public repo (prefix match). Keep in sync with
# CLOSED_PREFIXES in scripts/publish-open.sh, plus infra that is pro-only.
EXCLUDES=(
  apps/manage
  docs/internal
  modules/banking
  modules/team-hr
  # time-tracking pulled back to pro-only 2026-07-13 (see publish-open.sh)
  modules/time-tracking
  packages/banking
  packages/brand-assets
  packages/document-scanner
  packages/engenty-cli
  packages/pdf-service/assets/fonts/fontshare
  packages/plate-editor
  # Deploy pipeline is engenty-pro-only; on the public repo it just 403s
  # (its token can't push to pro-owned GHCR packages).
  .github/workflows/build-images.yml
)

git fetch -q "$PUBLIC_REMOTE" "$PUBLIC_BRANCH"

# Build the publish tree in a throwaway index so the working tree is untouched.
tmp_index="$(mktemp)"
trap 'rm -f "$tmp_index"' EXIT
GIT_INDEX_FILE="$tmp_index" git read-tree "$SOURCE"
GIT_INDEX_FILE="$tmp_index" git rm --cached -rq --ignore-unmatch "${EXCLUDES[@]}"

# Never touch the public repo's .github/workflows/** — PUBLIC_REPO_PUSH_TOKEN is
# Contents-scoped only, so GitHub rejects any push that creates/updates/deletes a
# workflow file (no `workflow` scope). Mirror the public branch's own workflow
# tree into our snapshot so those paths never appear in the push diff. The public
# repo's CI is therefore managed directly on the mirror, not synced from here.
GIT_INDEX_FILE="$tmp_index" git rm --cached -rq --ignore-unmatch .github/workflows
pub_workflows="$(git rev-parse -q --verify "$PUBLIC_REMOTE/$PUBLIC_BRANCH:.github/workflows" 2>/dev/null || true)"
if [[ -n "$pub_workflows" ]]; then
  GIT_INDEX_FILE="$tmp_index" git read-tree --prefix=.github/workflows/ "$pub_workflows"
fi

tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree)"

# Safety: refuse if any excluded path survived into the tree.
leak="$(git ls-tree -r --name-only "$tree" \
  | grep -E "^($(IFS='|'; echo "${EXCLUDES[*]}"))(/|$)" || true)"
if [[ -n "$leak" ]]; then
  printf 'REFUSING to publish — excluded paths present in tree:\n%s\n' "$leak" >&2
  exit 1
fi

commit="$(git commit-tree "$tree" -p "$PUBLIC_REMOTE/$PUBLIC_BRANCH" -m "$MESSAGE")"

changed="$(git diff --stat "$PUBLIC_REMOTE/$PUBLIC_BRANCH" "$commit" | tail -1)"
printf 'Publish %s -> %s/%s\n  %s\n' "$SOURCE" "$PUBLIC_REMOTE" "$PUBLIC_BRANCH" "${changed:-no changes}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] not pushing."
  exit 0
fi

git push "$PUBLIC_REMOTE" "$commit:$PUBLIC_BRANCH"
echo "Published: $MESSAGE"
