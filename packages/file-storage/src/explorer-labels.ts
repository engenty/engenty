/**
 * Display names for the admin bucket explorer (`/admin/files`).
 *
 * Object keys stay UUIDs — this only relabels segments the inspector shows.
 * Space folders are `spaces/<spaceId>/`; native file-space blobs are
 * `…/files/<entryId>` with no extra path. Other UUID leaves (ai workspace,
 * chat, …) are left alone.
 */
import {
  FILE_STORAGE_ROOT_SEGMENT,
  FILE_STORAGE_SPACES_SEGMENT,
  knowledgePathLabelFromFileStorageKey,
  parseFileStorageSpaceObjectKey,
  pathSegmentsAfterFileStorageTenantRoot,
} from "./internal-storage-path.js";

const FILE_STORAGE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFileStorageUuidSegment(value: string): boolean {
  return FILE_STORAGE_UUID.test(value);
}

/**
 * Path segments the explorer shows: after `tenants/<id>/` for an absolute key,
 * or the tenant-relative prefix as-is (`spaces/<id>/files/`).
 */
export function fileStorageExplorerSegments(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === FILE_STORAGE_ROOT_SEGMENT && segments.length >= 2) {
    return segments.slice(2);
  }
  return segments;
}

/** The space UUID in `spaces/<id>/…`, or null when the path is not space-scoped. */
export function spaceIdFromFileStorageExplorerPath(
  path: string
): string | null {
  const segments = fileStorageExplorerSegments(path);
  const id =
    segments[0] === FILE_STORAGE_SPACES_SEGMENT ? segments[1] : undefined;
  return id && isFileStorageUuidSegment(id) ? id : null;
}

/**
 * True when this explorer folder *is* a space: tenant-relative `spaces/<id>/`.
 *
 * Deeper prefixes (`spaces/<id>/files/`) belong to the space but are not the
 * space folder — overlaying them would rename `files` to the space name.
 */
export function isSpaceFolderExplorerPrefix(prefix: string): boolean {
  const segments = fileStorageExplorerSegments(prefix);
  return (
    segments.length === 2 &&
    segments[0] === FILE_STORAGE_SPACES_SEGMENT &&
    isFileStorageUuidSegment(segments[1] ?? "")
  );
}

/**
 * A space's own native file-space blob: `tenants/<t>/spaces/<s>/files/<entryId>`.
 *
 * Project-owned keys nest `files/<ownerType>/<ownerId>/<entry>` and stay opaque.
 */
export function isNativeFileSpaceObjectKey(key: string): boolean {
  const parsed = parseFileStorageSpaceObjectKey(key);
  if (parsed?.moduleFolder !== "files") {
    return false;
  }
  const leaf = parsed.pathSegments[0];
  return (
    parsed.pathSegments.length === 1 &&
    Boolean(leaf) &&
    isFileStorageUuidSegment(leaf)
  );
}

export function collectFileStorageExplorerIds(paths: {
  keys?: readonly string[];
  prefixes?: readonly string[];
}): { fileKeys: string[]; spaceIds: string[] } {
  const spaceIds = new Set<string>();
  const fileKeys: string[] = [];
  for (const path of [...(paths.keys ?? []), ...(paths.prefixes ?? [])]) {
    const spaceId = spaceIdFromFileStorageExplorerPath(path);
    if (spaceId) {
      spaceIds.add(spaceId);
    }
  }
  for (const key of paths.keys ?? []) {
    if (isNativeFileSpaceObjectKey(key)) {
      fileKeys.push(key);
    }
  }
  return { fileKeys, spaceIds: [...spaceIds] };
}

export function labelFileStorageExplorerSegments(
  segments: readonly string[],
  labels: Readonly<Record<string, string>>
): string[] {
  return segments.map((segment) => labels[segment] ?? segment);
}

/**
 * Folder hint for the inspector: KB slugs keep their own label; otherwise
 * join the prefix after the tenant root, substituting known UUIDs.
 */
export function fileStorageExplorerPathLabel(
  key: string,
  labels: Readonly<Record<string, string>>
): string | undefined {
  const knowledge = knowledgePathLabelFromFileStorageKey(key);
  if (knowledge) {
    return knowledge;
  }
  const segments = pathSegmentsAfterFileStorageTenantRoot(key);
  const folders = segments.slice(0, -1);
  if (folders.length === 0) {
    return;
  }
  return labelFileStorageExplorerSegments(folders, labels).join(" › ");
}

export function overlayExplorerFolderName(
  folder: { name: string; prefix: string },
  labels: Readonly<Record<string, string>>,
  titles?: Readonly<Record<string, string>>
): { name: string; prefix: string; title?: string } {
  if (!isSpaceFolderExplorerPrefix(folder.prefix)) {
    return folder;
  }
  const spaceId = spaceIdFromFileStorageExplorerPath(folder.prefix);
  const labeled = spaceId ? labels[spaceId] : undefined;
  if (!(spaceId && labeled)) {
    return folder;
  }
  return {
    name: labeled,
    prefix: folder.prefix,
    ...(titles?.[spaceId] ? { title: titles[spaceId] } : { title: spaceId }),
  };
}
