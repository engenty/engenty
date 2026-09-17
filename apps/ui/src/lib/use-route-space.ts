/**
 * The space the URL says the user is in (PLAN-spaces.md Phase 5a, Routing).
 *
 * `WorkspaceContext.currentSpace` was seeded from the server's default space in
 * Phase 0. Once `/s/<key>/…` exists, the URL is the truth: keeping a second copy
 * in state would drift on back/forward, and a module reading a stale space would
 * build workspace paths into the wrong prefix.
 *
 * Falls back to the server's value outside a space route — a global app still
 * runs inside a tenant that has a default space, and modules that build storage
 * paths need one either way.
 */
import { setApiClientSpaceProvider } from "@engenty/api-client";
import type { WorkspaceSpace } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { rememberSpaceKey } from "@/lib/landing-space";
import { parseSpacePath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

/**
 * The last space key the URL carried, for callers that need it after the
 * URL has stopped carrying one: the legacy `/mdl/*` redirect, and `/` /
 * unmatched-route landing.
 *
 * Modules build absolute links from a `/mdl/<module>` base constant — eleven of
 * them do, and rewriting all of them is the version of this that stalls. So a
 * module navigating internally from inside a space lands on `/mdl/…`, where the
 * space is no longer in the URL. Without this memory the redirect sends the user
 * to the tenant's DEFAULT space, silently relocating them mid-click: clicking
 * through the Tasks tab in space B would drop them in space A.
 *
 * Deliberately a plain module variable (plus localStorage) rather than state:
 * nothing re-renders on it, it is read at redirect time, and making it context
 * would put a provider between every route and its space for a value only a
 * handful of redirects read.
 */
export { rememberedSpaceKey } from "@/lib/landing-space";

/**
 * The resolved space id every API request carries as `x-engenty-space-id`
 * (PLAN-spaces.md Phase CN.3) — so a module page inside a space sees the
 * accounts that space mounts, and not the tenant's whole list.
 *
 * A module variable for the same reason as `rememberedSpaceKey` above: it is read
 * inside `fetch`, not during render, and making it context would put a
 * provider between every route and a value no component displays. Registered
 * with the api client once, in App, rather than read from there directly —
 * packages must not import the app.
 */
let currentSpaceId: string | null = null;

export function currentRequestSpaceId(): string | null {
  return currentSpaceId;
}

// Registered on import rather than in a component: this hook is what maintains
// the value, so the two cannot be wired up separately and get out of step.
setApiClientSpaceProvider(currentRequestSpaceId);

export function useRouteSpace(
  fallback: WorkspaceSpace | null
): WorkspaceSpace | null {
  const location = useLocation();
  const spacesQuery = useSpacesQuery();
  const spaceKey = parseSpacePath(location.pathname)?.spaceKey ?? null;

  if (spaceKey) {
    rememberSpaceKey(spaceKey);
  }

  const space = useMemo(() => {
    if (!spaceKey) {
      return fallback;
    }
    const match = spacesQuery.data?.find((space) => space.key === spaceKey);
    // An unknown key (deleted space, typo, another tenant's) resolves to the
    // fallback rather than null: null would make every module think it has no
    // space at all, which is a bigger break than being one space off.
    return match
      ? { id: match.id, key: match.key, name: match.name }
      : fallback;
  }, [fallback, spaceKey, spacesQuery.data]);
  // Assigned during render on purpose: the next request must carry the space
  // the user is ALREADY looking at, and an effect would leave the first fetch
  // after a navigation on the previous space. Idempotent, so a double render
  // in strict mode changes nothing.
  currentSpaceId = space?.id ?? null;
  return space;
}
