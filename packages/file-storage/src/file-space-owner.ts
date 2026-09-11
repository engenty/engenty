/**
 * How a container addresses its file space (PLAN-spaces.md Phase 4).
 *
 * `module_files` keys every folder and entry by `(tenant_id, owner_type,
 * owner_id)`, and `owner_type` is free text — which is why a project's Files
 * tab and the Drive's `Projects/<project>/` node could each build that pair
 * their own way and slowly disagree about which one they mean. The plan's words
 * for this are "ONE object, two renderings … enforce with a shared resolver; if
 * they can drift, they will", so both go through the functions below and a test
 * pins them to the same value.
 *
 * Deliberately NOT an enum column in the database: the free-text `owner_type`
 * is what makes adding the space owner a no-migration change, and constraining
 * it now would buy nothing that this module's types do not already give the
 * callers that matter.
 */

export const FILE_SPACE_OWNER_KINDS = ["project", "space"] as const;
export type FileSpaceOwnerKind = (typeof FILE_SPACE_OWNER_KINDS)[number];

export interface FileSpaceOwnerRef {
  id: string;
  type: FileSpaceOwnerKind;
}

/** The file space behind a project's Files tab — and behind its Drive folder. */
export function projectFileSpaceOwner(projectId: string): FileSpaceOwnerRef {
  return { id: projectId, type: "project" };
}

/** The space's own file space: the Drive's root level. */
export function spaceFileSpaceOwner(spaceId: string): FileSpaceOwnerRef {
  return { id: spaceId, type: "space" };
}

export function isFileSpaceOwnerKind(
  value: unknown
): value is FileSpaceOwnerKind {
  return (
    typeof value === "string" &&
    (FILE_SPACE_OWNER_KINDS as readonly string[]).includes(value)
  );
}

/**
 * The `/api/files/spaces/:ownerType/:ownerId` path fragment for an owner.
 *
 * Percent-encoded here rather than at each call site: an owner id reaches this
 * from a route parameter, and a raw `/` in one would silently address a
 * different file space.
 */
export function fileSpaceOwnerPath(owner: FileSpaceOwnerRef): string {
  return `${encodeURIComponent(owner.type)}/${encodeURIComponent(owner.id)}`;
}

/** Stable comparison key — two refs for the same file space compare equal. */
export function fileSpaceOwnerKey(owner: FileSpaceOwnerRef): string {
  return `${owner.type}:${owner.id}`;
}

/**
 * Inverse of {@link fileSpaceOwnerKey}.
 *
 * The Data URL carries `fs=space:<id>`; this turns that back into an owner ref
 * and returns null when the query string is missing or not a file-space key.
 */
export function parseFileSpaceOwnerKey(
  value: string | null | undefined
): FileSpaceOwnerRef | null {
  if (!value) {
    return null;
  }
  const separator = value.indexOf(":");
  const type = separator === -1 ? "" : value.slice(0, separator);
  const id = separator === -1 ? "" : value.slice(separator + 1);
  return isFileSpaceOwnerKind(type) && id ? { id, type } : null;
}

/**
 * React Query prefix for one file space's listings.
 *
 * Shared so the Files UI and the space Data tree invalidate together: a folder
 * created in one must appear in the other without a reload. The files module's
 * live binding (`queryRoot: ["files"]`) also matches this prefix.
 */
export const FILE_SPACE_QUERY_ROOT = ["files", "space"] as const;

/** Invalidation prefix for an owner's whole file space. */
export function fileSpaceInvalidationKey(owner: {
  id: string;
  type: string;
}): readonly ["files", "space", string, string] {
  return [...FILE_SPACE_QUERY_ROOT, owner.type, owner.id] as const;
}

/**
 * The Files UI listing for one folder.
 *
 * Distinct from {@link fileSpaceDriveQueryKey} because the two queryFns return
 * different shapes — they must not share a cache entry — but they share
 * {@link fileSpaceInvalidationKey}, so a mutation refreshes both.
 */
export function fileSpaceListingQueryKey(
  owner: { id: string; type: string },
  folderId: string | null,
  search = ""
): readonly ["files", "space", string, string, string, string] {
  return [
    ...fileSpaceInvalidationKey(owner),
    folderId ?? "root",
    search,
  ] as const;
}

/** The Data tree's listing for one folder in the same file space. */
export function fileSpaceDriveQueryKey(
  owner: { id: string; type: string },
  folderId: string | null
): readonly ["files", "space", string, string, "drive", string] {
  return [
    ...fileSpaceInvalidationKey(owner),
    "drive",
    folderId ?? "root",
  ] as const;
}
