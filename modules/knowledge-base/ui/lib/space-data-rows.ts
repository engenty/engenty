/**
 * What the space Data pane hands a folder view, and how to link back into it.
 *
 * The host has already fetched the listing and it is the only place the tree
 * PATHS exist — a view that refetched from the KB's own API would get the same
 * records back without them, and would have to rebuild each path from the
 * adapter's naming convention to link a row anywhere. So the rows travel as
 * params, and these guards read them without trusting them: `params` is a bag
 * of unknowns by contract.
 */

/** A folder in the host's listing. */
export interface SpaceDataFolderRow {
  description?: string;
  name: string;
  nodeType?: string;
  path: string;
}

/** A record in the host's listing. */
export interface SpaceDataEntryRow {
  name: string;
  path: string;
  recordId: string;
  /** The article's own title, where the adapter sent one. */
  title?: string;
  updatedAt?: string;
}

export function isFolderRow(value: unknown): value is SpaceDataFolderRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.name === "string" && typeof row.path === "string";
}

export function isEntryRow(value: unknown): value is SpaceDataEntryRow {
  if (!isFolderRow(value)) {
    return false;
  }
  return (
    typeof (value as unknown as Record<string, unknown>).recordId === "string"
  );
}

export function folderRows(value: unknown): SpaceDataFolderRow[] {
  return Array.isArray(value) ? value.filter(isFolderRow) : [];
}

export function entryRows(value: unknown): SpaceDataEntryRow[] {
  return Array.isArray(value) ? value.filter(isEntryRow) : [];
}

/** `?as=folder` — the pane must know to LIST rather than read before it fetches. */
export function folderHref(spaceKey: string, path: string): string {
  return `/s/${encodeURIComponent(spaceKey)}/data?as=folder&path=${encodeURIComponent(path)}`;
}

export function nodeHref(spaceKey: string, path: string): string {
  return `/s/${encodeURIComponent(spaceKey)}/data?path=${encodeURIComponent(path)}`;
}

/**
 * The parent article's own id, taken from the `index.article.md` row.
 *
 * An article folder's params carry no record id of their own — a folder is
 * addressed by its path — but the adapter lists the article's own file inside
 * it, and that row carries the id. Which is half the reason the index is
 * listed rather than hidden.
 */
export const ARTICLE_INDEX_NAME = "index.article.md";

export function indexArticleId(entries: SpaceDataEntryRow[]): string | null {
  return (
    entries.find((entry) => entry.name === ARTICLE_INDEX_NAME)?.recordId ?? null
  );
}
