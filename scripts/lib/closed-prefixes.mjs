import path from "node:path";
import { CLOSED_PREFIXES } from "./closed-paths.mjs";

/**
 * Pro-only path prefixes, from the one list that defines them:
 * scripts/lib/closed-paths.mjs. This used to parse the `CLOSED_PREFIXES=(`
 * bash array out of scripts/publish-open.sh; that array now just shells out to
 * closed-paths.mjs, so the parser scraped `$_prefix` and an error string and
 * every caller saw a list that matched nothing — `moduleTier` answered "open"
 * for every closed module.
 */
export function readClosedPrefixes() {
  return [...CLOSED_PREFIXES];
}

export function tryReadClosedPrefixes() {
  return readClosedPrefixes();
}

export function isClosedPath(relativePath, closedPrefixes) {
  const normalized = relativePath.split(path.sep).join("/");
  return closedPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

/**
 * "pro" if the module's repo-relative dir is under a closed prefix, else "open".
 */
export function moduleTier(relDir, closedPrefixes) {
  return isClosedPath(relDir, closedPrefixes) ? "pro" : "open";
}
