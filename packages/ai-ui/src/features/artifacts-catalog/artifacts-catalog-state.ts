// Grouping + formatting helpers for the tenant-wide artifacts admin list.
// The organising principle is *where the artifact lives*: rows are grouped by
// their physical storage backend, and each row also carries its logical scope.

import type { AdminArtifactRow } from "../../artifacts/artifacts-api";

/** Physical storage backends, in display order. */
export const ARTIFACT_STORAGE_ORDER = ["inline", "blob"] as const;

export interface ArtifactStorageGroup {
  /** "inline" | "blob" — matches ai.artifact.storage. */
  id: string;
  rows: AdminArtifactRow[];
}

/** Group rows by physical storage backend, preserving each group's sort. */
export function groupArtifactsByStorage(
  rows: AdminArtifactRow[]
): ArtifactStorageGroup[] {
  const buckets = new Map<string, AdminArtifactRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.storage) ?? [];
    bucket.push(row);
    buckets.set(row.storage, bucket);
  }
  // Known backends first (stable order), then any unexpected values as-seen.
  const ids = [
    ...ARTIFACT_STORAGE_ORDER.filter((id) => buckets.has(id)),
    ...[...buckets.keys()].filter(
      (id) => !ARTIFACT_STORAGE_ORDER.includes(id as never)
    ),
  ];
  return ids.map((id) => ({ id, rows: buckets.get(id) ?? [] }));
}

export function formatArtifactSize(bytes: number | null): string | null {
  if (bytes == null) {
    return null;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Truncate an id for display without losing the recognisable prefix. */
export function shortArtifactId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
