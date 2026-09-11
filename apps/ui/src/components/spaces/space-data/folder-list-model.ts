/**
 * Filter, sort, and page a Data-folder listing on the client.
 *
 * `/data/list` has no search or page query — adapters already cap a folder at
 * the first page and say so with `truncated`. This keeps the pane honest about
 * that bound while still giving a real list: search and sort the rows the
 * host already fetched, then page them for the admin list chrome.
 */
import type { DriveNodeKind } from "@engenty/file-storage";

export type FolderListColumn = "kind" | "name" | "updatedAt";
export type FolderListSortColumn = FolderListColumn;

export interface FolderChildRow {
  /** Module-tree path; present on `/data/*` rows, absent on artifacts. */
  dataPath?: string;
  href: string;
  id: string;
  kind: DriveNodeKind;
  name: string;
  nodeType?: string;
  /** Artifact id, or the node's own store id. Used to archive / move artifacts. */
  sourceId?: string;
  subtitle?: string;
  updatedAt?: string;
}

/** A module root (`Contacts`) is unmounted, not bulk-deleted. */
export function isDataRootPath(path: string): boolean {
  return !path.includes("/");
}

/** An `ai.artifact` row — including artifact folders, whose kind is `folder`. */
export function isArtifactListRow(row: FolderChildRow): boolean {
  return (
    row.kind === "artifact" ||
    (row.kind === "folder" &&
      row.nodeType === "folder" &&
      !row.dataPath &&
      Boolean(row.sourceId))
  );
}

export function isFolderRowSelectable(row: FolderChildRow): boolean {
  if (isArtifactListRow(row)) {
    return Boolean(row.sourceId);
  }
  return Boolean(row.dataPath && !isDataRootPath(row.dataPath));
}

export interface FolderBulkDataNode {
  path: string;
  recursive: boolean;
}

export interface FolderBulkTargets {
  artifactIds: string[];
  dataNodes: FolderBulkDataNode[];
}

function pruneNestedDataNodes(
  nodes: FolderBulkDataNode[]
): FolderBulkDataNode[] {
  return nodes.filter(
    (node) =>
      !nodes.some(
        (other) =>
          other.recursive &&
          other.path !== node.path &&
          node.path.startsWith(`${other.path}/`)
      )
  );
}

/**
 * Split a multi-select into the two stores a bulk action must talk to.
 *
 * Artifacts archive by id; module records delete by data path. Nested paths
 * under a selected recursive folder are dropped — the parent delete covers them.
 */
export function partitionFolderBulkTargets(
  rows: FolderChildRow[],
  selectedIds: ReadonlySet<string>
): FolderBulkTargets {
  const artifactIds: string[] = [];
  const dataNodes: FolderBulkDataNode[] = [];
  for (const row of rows) {
    if (!selectedIds.has(row.id)) {
      continue;
    }
    if (isArtifactListRow(row) && row.sourceId) {
      artifactIds.push(row.sourceId);
      continue;
    }
    if (row.dataPath && !isDataRootPath(row.dataPath)) {
      dataNodes.push({
        path: row.dataPath,
        recursive: row.kind === "folder" || row.kind === "bundle",
      });
    }
  }
  return { artifactIds, dataNodes: pruneNestedDataNodes(dataNodes) };
}

export const FOLDER_LIST_COLUMNS: FolderListColumn[] = [
  "name",
  "kind",
  "updatedAt",
];

export const FOLDER_LIST_DISPLAY_DEFAULTS: {
  columnOrder: FolderListColumn[];
  columnVisibility: Record<FolderListColumn, boolean>;
  sortBy: FolderListSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: "compact";
  viewMode: "table";
} = {
  columnOrder: FOLDER_LIST_COLUMNS,
  columnVisibility: {
    kind: true,
    name: true,
    updatedAt: true,
  },
  sortBy: "name",
  sortOrder: "asc",
  tableSize: "compact",
  viewMode: "table",
};

/** Hub / Ablage: newest deliverables first, same chrome as a folder list. */
export const FOLDER_LIST_LATEST_DEFAULTS = {
  ...FOLDER_LIST_DISPLAY_DEFAULTS,
  sortBy: "updatedAt" as FolderListSortColumn,
  sortOrder: "desc" as const,
};

function searchHaystack(row: FolderChildRow): string {
  return [row.name, row.subtitle, row.kind, row.nodeType]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

export function filterFolderRows(
  rows: FolderChildRow[],
  search: string
): FolderChildRow[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return rows;
  }
  return rows.filter((row) => searchHaystack(row).includes(query));
}

function compareFolderRows(
  left: FolderChildRow,
  right: FolderChildRow,
  sortBy: FolderListSortColumn
): number {
  if (sortBy === "updatedAt") {
    const leftStamp = left.updatedAt ? Date.parse(left.updatedAt) : 0;
    const rightStamp = right.updatedAt ? Date.parse(right.updatedAt) : 0;
    return leftStamp - rightStamp;
  }
  const leftValue =
    sortBy === "kind" ? left.kind : left.name.toLocaleLowerCase();
  const rightValue =
    sortBy === "kind" ? right.kind : right.name.toLocaleLowerCase();
  return leftValue.localeCompare(rightValue);
}

export function sortFolderRows(
  rows: FolderChildRow[],
  sortBy: FolderListSortColumn,
  sortOrder: "asc" | "desc"
): FolderChildRow[] {
  const sorted = [...rows].sort((left, right) => {
    const cmp = compareFolderRows(left, right, sortBy);
    return sortOrder === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function pageFolderRows<T>(
  rows: T[],
  page: number,
  pageSize: number
): { page: number; rows: T[]; total: number; totalPages: number } {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    rows: rows.slice(start, start + pageSize),
    total,
    totalPages,
  };
}

export function applyFolderList(
  rows: FolderChildRow[],
  input: {
    page: number;
    pageSize: number;
    search: string;
    sortBy: FolderListSortColumn;
    sortOrder: "asc" | "desc";
  }
): {
  page: number;
  rows: FolderChildRow[];
  total: number;
  totalPages: number;
} {
  const filtered = filterFolderRows(rows, input.search);
  const sorted = sortFolderRows(filtered, input.sortBy, input.sortOrder);
  return pageFolderRows(sorted, input.page, input.pageSize);
}

export function formatFolderRowDate(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString();
}
