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
#     PUBLIC_TAG        also tag the published commit (e.g. v0.2.0); the mirror's
#                       publish-images.yml builds its release images from it, and
#                       the tag gives OSS users a release to check out
#     DRY_RUN=1         build + safety-check, but don't push
#
# The CI wrapper (.github/workflows/publish-open.yml) adds a token-authed remote
# and calls this on every v* tag.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SOURCE="${1:-origin/main}"
PUBLIC_REMOTE="${PUBLIC_REMOTE:-upstream}"
PUBLIC_BRANCH="${PUBLIC_BRANCH:-main}"
MESSAGE="${MESSAGE:-chore: sync open source}"
PUBLIC_TAG="${PUBLIC_TAG:-}"
DRY_RUN="${DRY_RUN:-0}"

# The open/closed boundary lives in ONE place — scripts/lib/closed-paths.mjs —
# because this list, CLOSED_PREFIXES in publish-open.sh, and the plugin slugs
# used to be maintained by hand and drifted. Prefix match, as before.
EXCLUDES=()
while IFS= read -r _prefix; do
  [[ -n "$_prefix" ]] && EXCLUDES+=("$_prefix")
done < <(node "$ROOT/scripts/lib/closed-paths.mjs")
if [[ ${#EXCLUDES[@]} -eq 0 ]]; then
  echo "Could not read scripts/lib/closed-paths.mjs — refusing to publish." >&2
  exit 1
fi

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

# The public tree has no closed modules, so engenty.plugins must not list them:
# the mirror's own `pnpm plugins:check` resolves every slug to an on-disk plugin
# and fails otherwise. It did, on every release — 5 pro-only slugs, exit 1.
# publish-open.sh has always stripped them; this script never did, and this is
# the script CI actually runs.
#
# Rewritten IN THE INDEX, because this script deliberately leaves the working
# tree untouched.
stripped_pkg="$(git show "$SOURCE:package.json" | node scripts/strip-closed-plugins-stdin.mjs)"
pkg_blob="$(printf '%s' "$stripped_pkg" | git hash-object -w --stdin)"
GIT_INDEX_FILE="$tmp_index" git update-index --cacheinfo "100644,$pkg_blob,package.json"

# The deploy files name their images in full, because Coolify's compose parser
# ignores a `${VAR:-default}` fallback in an `image:` field and an unset
# variable takes the app down mid-deploy. So the pro tree says
# `engenty-pro-<service>` and the mirror says `engenty-<service>`: same files,
# one name dropped here, and neither side has an environment variable to
# remember. Also rewritten in the index, for the same reason as package.json.
for deploy_file in \
  deploy/docker-compose.prebuilt.yaml \
  deploy/docker-compose.edge.prebuilt.yaml \
  deploy/docker-compose.backend.prebuilt.yaml \
  deploy/docker-compose.migrate.prebuilt.yaml \
  deploy/scripts/coolify-deploy.sh; do
  if ! git cat-file -e "$SOURCE:$deploy_file" 2>/dev/null; then
    continue
  fi
  original="$(git show "$SOURCE:$deploy_file")"
  public="${original//ghcr.io\/engenty\/engenty-pro-/ghcr.io/engenty/engenty-}"
  if [[ "$public" == "$original" ]]; then
    continue
  fi
  mode="$(git ls-tree "$SOURCE" -- "$deploy_file" | awk '{print $1}')"
  blob="$(printf '%s\n' "$public" | git hash-object -w --stdin)"
  GIT_INDEX_FILE="$tmp_index" git update-index --cacheinfo "$mode,$blob,$deploy_file"
done

tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree)"

# Safety: refuse if any excluded path survived into the tree.
leak="$(git ls-tree -r --name-only "$tree" \
  | grep -E "^($(IFS='|'; echo "${EXCLUDES[*]}"))(/|$)" || true)"
if [[ -n "$leak" ]]; then
  printf 'REFUSING to publish — excluded paths present in tree:\n%s\n' "$leak" >&2
  exit 1
fi

# Same idea for the manifest: a closed slug surviving here does not leak code,
# but it red-lines the public repo's CI on every release, which is how this went
# unnoticed for so long — the failure was over on the mirror, not here.
plugin_leak="$(git show "$tree:package.json" | node -e "
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  const { CLOSED_PLUGIN_SLUGS } = await import('./scripts/lib/closed-paths.mjs');
  const pkg = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const listed = Object.keys(pkg?.engenty?.plugins ?? {});
  console.log(CLOSED_PLUGIN_SLUGS.filter((s) => listed.includes(s)).join('\n'));
});
")"
if [[ -n "$plugin_leak" ]]; then
  printf 'REFUSING to publish — closed plugins still in engenty.plugins:\n%s\n' "$plugin_leak" >&2
  exit 1
fi

commit="$(git commit-tree "$tree" -p "$PUBLIC_REMOTE/$PUBLIC_BRANCH" -m "$MESSAGE")"

changed="$(git diff --stat "$PUBLIC_REMOTE/$PUBLIC_BRANCH" "$commit" | tail -1)"
printf 'Publish %s -> %s/%s\n  %s\n' "$SOURCE" "$PUBLIC_REMOTE" "$PUBLIC_BRANCH" "${changed:-no changes}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] not pushing."
  if [[ -n "$PUBLIC_TAG" ]]; then
    echo "[dry-run] would tag the published commit $PUBLIC_TAG."
  fi
  exit 0
fi

git push "$PUBLIC_REMOTE" "$commit:$PUBLIC_BRANCH"
echo "Published: $MESSAGE"

# The tag names the snapshot commit, not the pro commit it was filtered from —
# that one does not exist on the mirror. Pushed after the branch so a tag never
# points at a commit the branch has not reached.
if [[ -n "$PUBLIC_TAG" ]]; then
  git push "$PUBLIC_REMOTE" "$commit:refs/tags/$PUBLIC_TAG"
  echo "Tagged: $PUBLIC_TAG"
fi
