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
