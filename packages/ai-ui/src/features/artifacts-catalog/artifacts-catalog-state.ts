// Grouping + formatting helpers for the tenant-wide artifacts admin list.
// The organising principle is the artifact's *scope* — thread / task / project
// / goal — because scope is what determines who can see it. Physical storage
// is shown as a secondary per-card detail.

import type { AdminArtifactRow } from "../../artifacts/artifacts-api";

/** Scope types, in the promotion order thread → task → project → goal. */
export const ARTIFACT_SCOPE_ORDER = [
  "thread",
  "task",
  "project",
  "goal",
] as const;

export interface ArtifactScopeGroup {
  /** "thread" | "task" | "project" | "goal" — matches ai.artifact.scope_type. */
  id: string;
  rows: AdminArtifactRow[];
}

/** Group rows by scope type, preserving each group's incoming sort. */
export function groupArtifactsByScope(
  rows: AdminArtifactRow[]
): ArtifactScopeGroup[] {
  const buckets = new Map<string, AdminArtifactRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.scope_type) ?? [];
    bucket.push(row);
    buckets.set(row.scope_type, bucket);
  }
  // Known scopes first (stable order), then any unexpected values as-seen.
  const ids = [
    ...ARTIFACT_SCOPE_ORDER.filter((id) => buckets.has(id)),
    ...[...buckets.keys()].filter(
      (id) => !ARTIFACT_SCOPE_ORDER.includes(id as never)
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
