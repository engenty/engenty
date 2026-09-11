import type { FilesFileInfo } from "../api.js";

/* ── Column / sort types ── */

export type FilesColumnKey =
  | "filename"
  | "mime_type"
  | "size"
  | "module"
  | "inbox_message"
  | "created_at"
  | "key";

export type FilesSortColumn = "filename" | "size" | "mime_type" | "created_at";

export type FilesColumnVisibility = Record<FilesColumnKey, boolean>;

/** Wrapper to satisfy useTableSelection's `{ id: string }` constraint. */
export type FilesFileWithId = FilesFileInfo & { id: string };

/** Sortable columns → backend sort key (others are display-only). */
export const FILES_COLUMN_TO_SORT: Partial<
  Record<FilesColumnKey, FilesSortColumn>
> = {
  filename: "filename",
  mime_type: "mime_type",
  size: "size",
  created_at: "created_at",
};

/**
 * Sort a batch of files by the list's active column.
 *
 * Extracted because the tree renders more than one batch: the folder rows
 * expanded in place each fetch their own children, and a child batch sorted by
 * a different rule than its parent reads as a bug, not as a nested list.
 */
export function sortFilesBy(
  files: FilesFileWithId[],
  sortBy: FilesSortColumn,
  sortOrder: "asc" | "desc"
): FilesFileWithId[] {
  const sorted = [...files];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "filename":
        cmp = a.filename.localeCompare(b.filename);
        break;
      case "size":
        cmp = a.size_bytes - b.size_bytes;
        break;
      case "mime_type":
        cmp = a.mime_type.localeCompare(b.mime_type);
        break;
      case "created_at":
        cmp = a.created_at.localeCompare(b.created_at);
        break;
    }
    return sortOrder === "desc" ? -cmp : cmp;
  });
  return sorted;
}

/* ── Display defaults (persisted via useListDisplayState) ── */

export const FILES_DISPLAY_DEFAULTS = {
  viewMode: "table" as const,
  tableSize: "normal" as const,
  sortBy: "created_at" as FilesSortColumn,
  sortOrder: "desc" as const,
  columnVisibility: {
    filename: true,
    mime_type: true,
    size: true,
    module: true,
    inbox_message: true,
    created_at: true,
    key: false,
  } satisfies FilesColumnVisibility,
  columnOrder: [
    "filename",
    "mime_type",
    "size",
    "module",
    "inbox_message",
    "created_at",
    "key",
  ] as FilesColumnKey[],
};
