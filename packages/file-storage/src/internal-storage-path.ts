/**
 * Internal file storage bucket layout (single bucket, path-based tenancy):
 * `tenants/<tenant-id>/<module-folder>/...`
 */

export const FILE_STORAGE_ROOT_SEGMENT = "tenants" as const;

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

/** Third path segment after `tenants/<id>/` — the module folder (e.g. `inbox`, `expenses`). */
export function moduleFolderFromFileStorageKey(
  key: string
): string | undefined {
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
