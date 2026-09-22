// Where the river is on screen.
//
// One conversation, two addresses: `/copilot` outside any space, and
// `/s/<key>/copilot` inside one — the same thread, opened at the chapter that
// belongs to that space, with the space's own column kept beside it. `copilot`
// is a RESERVED space segment (space-module-url.ts), so the shell never reads
// it as a module and never swaps the column for a module's nav.
//
// There is no thread id in either address, because there is no thread to
// choose. A sub-run monitor rides on the same page as `?subRun=<toolCallId>`.
import { spaceKeyFromPathname } from "@engenty/ai-core/browser";

export const COPILOT_RIVER_PATH = "/copilot";
export const COPILOT_RIVER_SEGMENT = "copilot";
export const COPILOT_SUB_RUN_QUERY = "subRun";

/** The river in a space, or outside of one. */
export function copilotRiverPath(spaceKey?: string | null): string {
  const key = spaceKey?.trim() ?? "";
  return key
    ? `/s/${encodeURIComponent(key)}/${COPILOT_RIVER_SEGMENT}`
    : COPILOT_RIVER_PATH;
}

/** The river for the place you are standing on: its space's, or the global one. */
export function copilotRiverPathForPathname(pathname: string): string {
  return copilotRiverPath(spaceKeyFromPathname(pathname));
}

export function copilotRiverSubRunPath(
  toolCallId: string,
  spaceKey?: string | null
): string {
  const params = new URLSearchParams();
  params.set(COPILOT_SUB_RUN_QUERY, toolCallId);
  return `${copilotRiverPath(spaceKey)}?${params.toString()}`;
}

export function readCopilotSubRunToolCallId(search: string): string | null {
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  ).get(COPILOT_SUB_RUN_QUERY);
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** `/copilot` or `/s/<key>/copilot` — the page that IS the river. */
export function isCopilotRiverPathname(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1) {
    return segments[0] === COPILOT_RIVER_SEGMENT;
  }
  return (
    segments.length === 3 &&
    segments[0] === "s" &&
    segments[2] === COPILOT_RIVER_SEGMENT
  );
}
