/**
 * Internal file storage bucket layout (single bucket, path-based tenancy):
 * `tenants/<tenant-id>/<module-folder>/...`
 *
 * Spaces nest EXACTLY ONE boundary below the tenant and ABOVE the module folder
 * (PLAN-spaces.md §1b): `tenants/<tenant-id>/spaces/<space-id>/<module-folder>/...`.
 * Prefix containment is the access guarantee — a space-scoped engenty cannot
 * address another space's bytes because no path exists, not because a check said
 * no. Do not nest further: the tier under Project is a union (Goal|Routine|Phase)
 * with optional edges, so deeper nesting would encode a variant chain into paths.
 */

export const FILE_STORAGE_ROOT_SEGMENT = "tenants" as const;

/**
 * Reserved module-folder name. `tenants/<t>/spaces/...` always means the space
 * boundary, so no module may claim `spaces` as its folder — that is what lets a
 * key be classified as tenant-level or space-level by shape alone.
 */
export const FILE_STORAGE_SPACES_SEGMENT = "spaces" as const;

/**
 * Build an object key under the internal layout.
 *
 * @example fileStorageTenantObjectKey(tid, "inbox", messageId, filename)
 * @example fileStorageTenantObjectKey(tid, "knowledge-base", kbSlug, filename)
 */
export function fileStorageTenantObjectKey(
  tenantId: string,
  moduleFolder: string,
  ...pathSegments: string[]
): string {
  return [
    FILE_STORAGE_ROOT_SEGMENT,
    tenantId,
    moduleFolder,
    ...pathSegments,
  ].join("/");
}

function requireKeySegment(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label}_required`);
  }
  if (trimmed.includes("/") || trimmed.includes("..")) {
    throw new Error(`${label}_invalid`);
  }
  return trimmed;
}

/**
 * The space root: `tenants/<t>/spaces/<s>`. A space delete removes everything
 * under this prefix in one sweep (drive, agent scratch, artifact mirrors).
 */
export function fileStorageSpacePrefix(
  tenantId: string,
  spaceId: string
): string {
  return [
    FILE_STORAGE_ROOT_SEGMENT,
    requireKeySegment("tenant_id", tenantId),
    FILE_STORAGE_SPACES_SEGMENT,
    requireKeySegment("space_id", spaceId),
  ].join("/");
}

/**
 * Build a space-scoped object key: `tenants/<t>/spaces/<s>/<moduleFolder>/…`.
 *
 * The sibling of {@link fileStorageTenantObjectKey}, not a replacement — tenant-level
 * paths (skills, the Global commons) must keep working unchanged.
 *
 * @example fileStorageSpaceObjectKey(tid, sid, "files", "brief.pdf")
 * @example fileStorageSpaceObjectKey(tid, sid, "ai", "workspace", "commons")
 */
export function fileStorageSpaceObjectKey(
  tenantId: string,
  spaceId: string,
  moduleFolder: string,
  ...pathSegments: string[]
): string {
  return [
    fileStorageSpacePrefix(tenantId, spaceId),
    moduleFolder,
    ...pathSegments,
  ].join("/");
}

export interface ParsedFileStorageSpaceKey {
  moduleFolder: string;
  /** Segments below the module folder, including the filename. */
  pathSegments: string[];
  spaceId: string;
  tenantId: string;
}

/**
 * Parse counterpart of {@link fileStorageSpaceObjectKey}. Returns `null` for a
 * tenant-level key — the discrimination the two layouts need, and the reason
 * {@link FILE_STORAGE_SPACES_SEGMENT} is reserved.
 */
export function parseFileStorageSpaceObjectKey(
  key: string
): ParsedFileStorageSpaceKey | null {
  const segments = key.split("/").filter(Boolean);
  if (
    segments.length < 5 ||
    segments[0] !== FILE_STORAGE_ROOT_SEGMENT ||
    segments[2] !== FILE_STORAGE_SPACES_SEGMENT
  ) {
    return null;
  }
  const [, tenantId, , spaceId, moduleFolder, ...pathSegments] = segments;
  if (!(tenantId && spaceId && moduleFolder)) {
    return null;
  }
  return { moduleFolder, pathSegments, spaceId, tenantId };
}

/** The module folder of a key, whether it is tenant-level or space-level. */
export function moduleFolderFromFileStorageKey(
  key: string
): string | undefined {
  const space = parseFileStorageSpaceObjectKey(key);
  if (space) {
    return space.moduleFolder;
  }
  const segments = key.split("/").filter(Boolean);
  if (segments.length < 3 || segments[0] !== FILE_STORAGE_ROOT_SEGMENT) {
    return;
  }
  return segments[2];
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Inbox attachment keys: `tenants/<tid>/inbox/<messageId>/...` */
export function inboxMessageIdFromFileStorageKey(key: string): string | null {
  const re = new RegExp(
    `^${FILE_STORAGE_ROOT_SEGMENT}/[^/]+/inbox/(${UUID})/`,
    "i"
  );
  const m = re.exec(key);
  return m?.[1] ?? null;
}

const KB_SLUG_PATTERN = /^tenants\/[^/]+\/knowledge-base\/([^/]+)\//;

/** KB originals: `tenants/.../knowledge-base/<kbSlug>/...` */
export function knowledgeBaseSlugFromFileStorageKey(
  key: string
): string | undefined {
  const m = KB_SLUG_PATTERN.exec(key);
  return m?.[1];
}

/** Human-readable label for file storage listings (API `path_label`). */
export function knowledgePathLabelFromFileStorageKey(
  key: string
): string | undefined {
  const slug = knowledgeBaseSlugFromFileStorageKey(key);
  return slug ? `knowledge-base › ${slug}` : undefined;
}

/**
 * Path segments after `tenants/<tenant-id>/` for breadcrumbs
 * (module folder and below, including filename).
 *
 * Deliberately literal: a space-scoped key still yields the `spaces/<id>/…`
 * segments, because that IS what follows the tenant root. Display code that
 * should hide the space boundary wants
 * {@link pathSegmentsAfterFileStorageContainerRoot} instead.
 */
export function pathSegmentsAfterFileStorageTenantRoot(
  fileKey: string
): string[] {
  const segments = fileKey.split("/").filter(Boolean);
  if (segments[0] === FILE_STORAGE_ROOT_SEGMENT && segments.length >= 3) {
    return segments.slice(2);
  }
  return segments;
}

/**
 * Path segments below the nearest container root — after `tenants/<t>/spaces/<s>/`
 * for a space key, after `tenants/<t>/` otherwise.
 *
 * This is the one to use for human-facing paths: the space id is a routing and
 * containment detail, not something to render in a breadcrumb.
 */
export function pathSegmentsAfterFileStorageContainerRoot(
  fileKey: string
): string[] {
  const space = parseFileStorageSpaceObjectKey(fileKey);
  if (space) {
    return [space.moduleFolder, ...space.pathSegments];
  }
  return pathSegmentsAfterFileStorageTenantRoot(fileKey);
}
