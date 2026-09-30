import type {
  SpaceDataContext,
  SpaceDataEntry,
  SpaceDataFolder,
  SpaceDataListing,
} from "./space-data.js";

/** What one root found for a query, paths relative to that root. */
export interface SpaceDataSearchResult {
  entries: SpaceDataEntry[];
  folders: SpaceDataFolder[];
  /** True when the root stopped early; the caller says so. */
  truncated?: boolean;
}

export interface SpaceDataSearchInput {
  /** At most this many hits (entries + folders). */
  limit: number;
  /** Trimmed, non-empty. */
  query: string;
}

/** Case-insensitive, accent-insensitive substring match. */
export function spaceDataNameMatches(name: string, query: string): boolean {
  const fold = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return fold(name).includes(fold(query));
}

/**
 * Search a root by walking its own `list`, breadth first, matching names.
 *
 * For roots whose tree IS the data (a folder of files) and which have no index
 * of their own. Bounded by `maxFolders` listings, so a deep tree answers with
 * what it reached and `truncated` rather than walking the whole store.
 */
export async function searchSpaceDataByWalk(
  list: (ctx: SpaceDataContext, path: string) => Promise<SpaceDataListing>,
  ctx: SpaceDataContext,
  input: SpaceDataSearchInput & { maxFolders?: number }
): Promise<SpaceDataSearchResult> {
  const maxFolders = input.maxFolders ?? 50;
  const result: SpaceDataSearchResult = { entries: [], folders: [] };
  const queue = [""];
  let listed = 0;
  const full = () =>
    result.entries.length + result.folders.length >= input.limit;
  while (queue.length > 0 && !full()) {
    if (listed >= maxFolders) {
      result.truncated = true;
      break;
    }
    const path = queue.shift() ?? "";
    listed += 1;
    const listing = await list(ctx, path);
    for (const folder of listing.folders) {
      queue.push(folder.path);
      if (!full() && spaceDataNameMatches(folder.name, input.query)) {
        result.folders.push(folder);
      }
    }
    for (const entry of listing.entries) {
      if (
        !full() &&
        spaceDataNameMatches(entry.title || entry.name, input.query)
      ) {
        result.entries.push(entry);
      }
    }
  }
  if (full() && queue.length > 0) {
    result.truncated = true;
  }
  return result;
}
