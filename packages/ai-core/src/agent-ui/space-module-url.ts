/**
 * Short URL segments for modules inside a space (PLAN-spaces.md Phase 5a).
 *
 * A space URL is meant to be read and typed by a person —
 * `/s/company/copilot/chat/…`, not `/s/company/engenty-copilot/chat/…`;
 * `/s/company/kb/…`, not `/s/company/knowledge-base/…`. The
 * module ID stays what it is everywhere else (mounts, manifests, tool names);
 * only the URL segment is shortened.
 *
 * **Why this table lives in ai-core and not in the shell.** The shell owns the
 * routes, but `agent-prompt-context-from-ui.ts` already has to read a pathname
 * back apart to tell the agent which module the user is looking at — it is a
 * second reader of the same scheme. One table imported by both readers is the
 * only version of this that cannot drift; two tables that must agree, in
 * packages that cannot import each other's tests, is how the agent ends up
 * resolving `copilot` against a registry that only knows `engenty-copilot`.
 *
 * Aliases are opt-in per module, never derived (stripping a leading `engenty-`
 * would silently claim `/s/x/core` for `engenty-core` the day someone adds it).
 */

/** moduleId → the segment used in `/s/<space>/<segment>/…`. */
export const SPACE_MODULE_URL_ALIASES: Readonly<Record<string, string>> = {
  "engenty-copilot": "copilot",
  "knowledge-base": "kb",
};

/**
 * Segments under `/s/<space>/` that are the SPACE's own pages, not modules.
 *
 * Without this every reader of the URL infers a module called "settings": the
 * shell slides the space sidebar away to show that module's (empty) nav, and
 * the agent reports `page_module: settings` and looks for tools under it. Both
 * are the same mistake made twice, which is why the answer lives beside the
 * alias table rather than in either reader.
 *
 * `data` joined it in PLAN-space-data.md D1. The Data tab used to resolve to a
 * module (the knowledge base, standing in) — it is now the space's OWN tree
 * over every store the space touches, so it is a placement, not a module.
 *
 * `agents` is the space roster (`/s/<key>/agents`) plus desks under it.
 *
 * `chats` is every conversation held in the space, across all of its agents
 * (PLAN-space-chats.md). Reserved for the same reason `data` is: it is one view
 * over what several modules produced, so no module owns it — and a module
 * called "chats" would take the space's sidebar away to show its own.
 *
 * `rooms` is one room by its thread id (`/s/<key>/rooms/<threadId>`,
 * PLAN-agent-rooms.md). A room is a thread agents participate in, not a page
 * of any one of them — so it is not under `agents/<host>` either.
 *
 * `notifications` is the space's inbox (`/s/<key>/notifications`). It is the
 * dashboard's full-screen list, not a module — without this the shell slides
 * the space sidebar away to show a phantom "notifications" nav.
 */
export const SPACE_RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  "agents",
  "chats",
  "data",
  "notifications",
  "rooms",
  "settings",
]);

/** Whether a `/s/<space>/<segment>` segment is a space page rather than a module. */
export function isSpaceReservedSegment(segment: string): boolean {
  return SPACE_RESERVED_SEGMENTS.has(segment.toLowerCase());
}

const MODULE_ID_BY_SEGMENT: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(SPACE_MODULE_URL_ALIASES).map(([id, segment]) => [
      segment,
      id,
    ])
  );

/** The URL segment for a module inside a space. Unaliased modules pass through. */
export function spaceModuleUrlSegment(moduleId: string): string {
  return SPACE_MODULE_URL_ALIASES[moduleId] ?? moduleId;
}

/**
 * The module ID behind a space URL segment.
 *
 * The canonical ID is still accepted as a segment, so links minted before the
 * alias existed keep resolving to the same module rather than 404ing.
 */
export function spaceModuleIdFromUrlSegment(segment: string): string {
  return MODULE_ID_BY_SEGMENT[segment] ?? segment;
}

/**
 * `/s/<key>/chats` — every conversation held in a space, across its agents.
 *
 * Here rather than in the shell's `space-routes.ts` because two packages that
 * cannot import each other both link to it: the shell, and the copilot
 * module's chat header. `chats` is already a reserved segment above, so the
 * segment and the builder that emits it stay in one file.
 */
export function spaceChatsPathname(spaceKey: string): string {
  return `/s/${encodeURIComponent(spaceKey)}/chats`;
}

/**
 * `/s/<key>/rooms/<threadId>` — one room of a space.
 *
 * The thread id names it, never its host: a room is the conversation its
 * agents and people hold, and the agent whose desk lists it first is a
 * detail of how turns are run. Shared like `spaceChatsPathname` because the
 * shell, the desk breadcrumb and a chat card all link here.
 */
export function spaceRoomPathname(spaceKey: string, threadId: string): string {
  return `/s/${encodeURIComponent(spaceKey)}/rooms/${encodeURIComponent(threadId)}`;
}

/**
 * The space key a pathname is inside, or null outside `/s/…`.
 *
 * Deliberately NOT "the space you are in": outside a space route this answers
 * null rather than a default, because the callers that need this are asking
 * whether the URL puts them in a space at all. A caller that must have *a*
 * space (module storage paths) wants the shell's resolver instead, which
 * falls back — see `useRouteSpace`.
 */
export function spaceKeyFromPathname(pathname: string): string | null {
  const match = pathname.trim().match(/^\/s\/([^/?#]+)/);
  const raw = match?.[1];
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    // A malformed escape in the address bar is not a crash — it is simply not
    // a key any space has.
    return raw;
  }
}

/** `/s/<key>/<segment>/…`, with the segment and the tail captured. */
const SPACE_MODULE_PATHNAME = /^\/s\/[^/]+\/([^/]+)((?:\/.*)?)$/;

/**
 * A module pathname in its canonical `/mdl/<moduleId>/…` form.
 *
 * Every module is mirrored at `/s/<key>/<segment>/…` and `LegacyModuleRedirect`
 * sends canonical links there, so inside a space that IS the URL — while the
 * matchers modules were written with (`pathname === "/mdl/offers"`,
 * `startsWith("/mdl/inbox/settings")`, `new RegExp("^/mdl/tasks/…")`) all still
 * describe the unmirrored shape. Each one silently answers "no" for the whole
 * time the user is in a space: sidebar rows stop highlighting, an inner tab
 * falls back to its default, a "legacy path" redirect never fires.
 *
 * Normalising the READ is the cheap half of the fix — one call where a
 * component takes `useLocation().pathname`, and every pure matcher below it
 * keeps working unchanged. The space prefix says where a module is MOUNTED and
 * never which of its pages is open, so it is noise to all of them.
 *
 * Building links needs the opposite treatment and is NOT this function's job:
 * a `/mdl/…` link still resolves inside a space (the redirect catches it), it
 * just costs a hop.
 */
export function canonicalModulePathname(pathname: string): string {
  const normalized = pathname.trim();
  const match = normalized.match(SPACE_MODULE_PATHNAME);
  const segment = match?.[1];
  if (!segment) {
    return normalized;
  }
  const decoded = decodeURIComponent(segment);
  if (isSpaceReservedSegment(decoded)) {
    // `/s/<key>/settings` and `/s/<key>/data` are the SPACE's own pages, not a
    // module called "settings" — see SPACE_RESERVED_SEGMENTS.
    return normalized;
  }
  return `/mdl/${spaceModuleIdFromUrlSegment(decoded)}${match[2] ?? ""}`;
}
