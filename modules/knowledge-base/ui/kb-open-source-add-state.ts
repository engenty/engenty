/** Router location state: open the sources “add” flow after navigating to the list. */
export const KB_OPEN_SOURCE_ADD_STATE_KEY = "kbOpenSourceAdd";

export type KbOpenSourceAddState =
  | true
  | "manual"
  | "file_upload"
  | { adapterId: string };

export type KbOpenSourceAddPreset =
  | "manual"
  | "file_upload"
  | { adapterId: string };

/** Navigate to sources with optional preset; omit preset for legacy first-adapter behavior. */
export function kbOpenSourceAddLocationState(
  preset?: KbOpenSourceAddPreset
): Record<string, unknown> {
  if (!preset) {
    return { [KB_OPEN_SOURCE_ADD_STATE_KEY]: true };
  }
  return { [KB_OPEN_SOURCE_ADD_STATE_KEY]: preset };
}

export function parseKbOpenSourceAddFromLocation(
  state: unknown
): KbOpenSourceAddState | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }
  const raw = (state as Record<string, unknown>)[KB_OPEN_SOURCE_ADD_STATE_KEY];
  if (raw === true) {
    return true;
  }
  if (raw === "manual" || raw === "file_upload") {
    return raw;
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { adapterId?: unknown }).adapterId === "string"
  ) {
    return { adapterId: (raw as { adapterId: string }).adapterId };
  }
  return null;
}

export function shouldOpenSourceAddFromLocation(state: unknown): boolean {
  return parseKbOpenSourceAddFromLocation(state) !== null;
}

/**
 * Query param that opens the add flow after landing on the sources list.
 *
 * Router state cannot carry this: a Space rewrites `/mdl/...` to `/s/<key>/...`
 * with its own navigation, and the state does not survive that hop. A search
 * param does, and it makes the flow linkable.
 */
export const KB_SOURCE_ADD_QUERY_PARAM = "add";

export function kbSourceAddSearch(preset: "wizard"): string {
  return `?${KB_SOURCE_ADD_QUERY_PARAM}=${preset}`;
}

/** Reads the add-flow request out of a location's search string. */
export function parseKbSourceAddFromSearch(search: string): "wizard" | null {
  const value = new URLSearchParams(search).get(KB_SOURCE_ADD_QUERY_PARAM);
  return value === "wizard" ? "wizard" : null;
}
