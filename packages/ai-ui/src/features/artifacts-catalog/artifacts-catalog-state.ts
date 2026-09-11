// Filter / sort / group logic for the artifacts admin list. Scope (thread /
// task / project / space / Engenty) is the default grouping because it decides
// who can see an artifact; storage, type, status and creator are also selectable.

import type { AdminArtifactRow } from "../../artifacts/artifacts-api";

export const ARTIFACT_SCOPE_ORDER = [
  "thread",
  "task",
  "project",
  "space",
  "agent",
] as const;
export const ARTIFACT_STORAGE_ORDER = ["inline", "blob"] as const;

export type ArtifactGroupBy =
  | "scope"
  | "type"
  | "storage"
  | "status"
  | "creator"
  | "none";
export type ArtifactSortBy = "title" | "updated_at" | "type";
export type ArtifactScopeFilter =
  | "all"
  | "thread"
  | "task"
  | "project"
  | "space"
  | "agent";
export type ArtifactStorageFilter = "all" | "inline" | "blob";
export type ArtifactStatusFilter = "active" | "archived" | "all";
export type ArtifactCreatorFilter = "all" | "agent" | "user";

export interface ArtifactCatalogFilterState {
  creator: ArtifactCreatorFilter;
  scope: ArtifactScopeFilter;
  searchQuery: string;
  sortBy: ArtifactSortBy;
  sortOrder: "asc" | "desc";
  status: ArtifactStatusFilter;
  storage: ArtifactStorageFilter;
  /** "all" or a concrete artifact type (markdown / html / table / …). */
  typeFilter: string;
}

export interface ArtifactCatalogGroup {
  id: string;
  rows: AdminArtifactRow[];
}

/** Fixed key order per grouping facet; type is sorted alphabetically instead. */
const GROUP_ORDER: Record<string, readonly string[]> = {
  creator: ["agent", "user"],
  scope: ARTIFACT_SCOPE_ORDER,
  status: ["active", "archived"],
  storage: ARTIFACT_STORAGE_ORDER,
};

function searchableText(row: AdminArtifactRow): string {
  return [
    row.title,
    row.type,
    row.scope_type,
    row.scope_id,
    row.storage,
    row.created_by_kind,
    row.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Distinct artifact types present in the data, for the type filter options. */
export function getArtifactTypeValues(rows: readonly AdminArtifactRow[]) {
  return [...new Set(rows.map((row) => row.type))]
    .filter(Boolean)
    .toSorted((left, right) => left.localeCompare(right));
}

export function filterAndSortArtifacts(
  rows: readonly AdminArtifactRow[],
  state: ArtifactCatalogFilterState
): AdminArtifactRow[] {
  const query = state.searchQuery.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (state.scope !== "all" && row.scope_type !== state.scope) {
      return false;
    }
    if (state.typeFilter !== "all" && row.type !== state.typeFilter) {
      return false;
    }
    if (state.storage !== "all" && row.storage !== state.storage) {
      return false;
    }
    if (state.status !== "all" && row.status !== state.status) {
      return false;
    }
    if (state.creator !== "all" && row.created_by_kind !== state.creator) {
      return false;
    }
    return !(query && !searchableText(row).includes(query));
  });

  const direction = state.sortOrder === "asc" ? 1 : -1;
  return filtered.toSorted((left, right) => {
    const leftValue =
      state.sortBy === "updated_at"
        ? left.updated_at
        : state.sortBy === "type"
          ? `${left.type}:${left.title}`
          : left.title;
    const rightValue =
      state.sortBy === "updated_at"
        ? right.updated_at
        : state.sortBy === "type"
          ? `${right.type}:${right.title}`
          : right.title;
    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });
}

function groupKey(row: AdminArtifactRow, groupBy: ArtifactGroupBy): string {
  switch (groupBy) {
    case "scope":
      return row.scope_type;
    case "storage":
      return row.storage;
    case "status":
      return row.status;
    case "creator":
      return row.created_by_kind;
    default:
      return row.type;
  }
}

export function groupArtifacts(
  rows: readonly AdminArtifactRow[],
  groupBy: ArtifactGroupBy
): ArtifactCatalogGroup[] {
  if (rows.length === 0) {
    return [];
  }
  if (groupBy === "none") {
    return [{ id: "all", rows: [...rows] }];
  }

  const buckets = new Map<string, AdminArtifactRow[]>();
  for (const row of rows) {
    const key = groupKey(row, groupBy);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const order = GROUP_ORDER[groupBy];
  const ids = order
    ? [
        ...order.filter((id) => buckets.has(id)),
        ...[...buckets.keys()].filter((id) => !order.includes(id)),
      ]
    : [...buckets.keys()].toSorted((left, right) => left.localeCompare(right));
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
