import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Badge,
  Button,
  Skeleton,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectionCell,
  TableSelectionHeader,
  TableSortableHeader,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon } from "@engenty/ui-icons";
import { ChevronRight, Folder, FolderOpen, Mail, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  type FilesFolderInfo,
  isFileStorageThumbnailSourceMime,
} from "../api.js";
import { filesChildrenQueryOptions } from "../queries.js";
import {
  FILES_COLUMN_TO_SORT,
  type FilesColumnKey,
  type FilesColumnVisibility,
  type FilesFileWithId,
  type FilesSortColumn,
  sortFilesBy,
} from "./file-columns.js";
import {
  formatBytes,
  formatDate,
  getFileIcon,
  getMimeLabel,
  isPreviewableImage,
} from "./file-helpers.js";
import { CardDocThumbnail, CardThumbnail } from "./file-thumbnails.js";

/** One nesting level of indent, in px. Small — depth can run several deep. */
const INDENT_STEP = 18;

interface FilesTableProps {
  bucket: string;
  columnOrder: FilesColumnKey[];
  columnVisibility: FilesColumnVisibility;
  expandedPrefixes: Set<string>;
  files: FilesFileWithId[];
  folders?: FilesFolderInfo[];
  onDelete: (key: string) => void;
  onDownload: (key: string, filename: string) => void;
  onOpenFolder?: (prefix: string) => void;
  onOpenFull?: (file: FilesFileWithId) => void;
  onPrefetchFolder?: (prefix: string) => void;
  onRowClick: (file: FilesFileWithId) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: FilesSortColumn) => void;
  onToggleFolder: (prefix: string) => void;
  selectedIds: Set<string>;
  sortBy: FilesSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: "compact" | "normal";
}

/**
 * Everything a row needs that does not change between rows.
 *
 * Bundled because folder rows expand into more rows of both kinds, at any
 * depth, and threading fifteen props through each recursion by hand is how
 * they drift apart.
 */
interface RowContext {
  bucket: string;
  compact: boolean;
  expandedPrefixes: Set<string>;
  onDelete: (key: string) => void;
  onDownload: (key: string, filename: string) => void;
  onOpenFolder?: (prefix: string) => void;
  onOpenFull?: (file: FilesFileWithId) => void;
  onPrefetchFolder?: (prefix: string) => void;
  onRowClick: (file: FilesFileWithId) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onToggleFolder: (prefix: string) => void;
  selectedIds: Set<string>;
  sortBy: FilesSortColumn;
  sortOrder: "asc" | "desc";
  visibleColumns: FilesColumnKey[];
}

function RowThumbnail({
  bucket,
  file,
}: {
  bucket: string;
  file: FilesFileWithId;
}) {
  const Icon = getFileIcon(file.mime_type);
  if (isPreviewableImage(file.mime_type)) {
    return (
      <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/30">
        <CardThumbnail fileKey={file.key} filename={file.filename} />
      </div>
    );
  }
  if (isFileStorageThumbnailSourceMime(file.mime_type)) {
    return (
      <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/30">
        <CardDocThumbnail bucket={bucket} fileKey={file.key} />
      </div>
    );
  }
  return <Icon className="h-5 w-5 text-muted-foreground" />;
}

function FileRow({
  ctx,
  depth,
  file,
}: {
  ctx: RowContext;
  depth: number;
  file: FilesFileWithId;
}) {
  const { t } = useTranslation("files");

  function renderCell(col: FilesColumnKey) {
    switch (col) {
      case "filename":
        return (
          <TableCell className="font-medium" key={col}>
            <div className="min-w-0 max-w-[min(100%,20rem)]">
              <div className="truncate" title={file.filename}>
                {file.filename}
              </div>
              {file.path_label ? (
                <div
                  className="truncate text-muted-foreground text-xxs"
                  title={file.key}
                >
                  {file.path_label}
                </div>
              ) : null}
            </div>
          </TableCell>
        );
      case "mime_type":
        return (
          <TableCell key={col}>
            <Badge variant="secondary">{getMimeLabel(file.mime_type)}</Badge>
          </TableCell>
        );
      case "size":
        return (
          <TableCell className="text-muted-foreground text-sm" key={col}>
            {formatBytes(file.size_bytes)}
          </TableCell>
        );
      case "module":
        return (
          <TableCell key={col}>
            {file.module ? (
              <Badge variant="outline">{file.module}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        );
      case "inbox_message":
        return (
          <TableCell key={col} onClick={(e) => e.stopPropagation()}>
            {file.inbox_message_id ? (
              <Link
                className="inline-flex items-center gap-1 text-primary text-sm underline-offset-4 hover:underline"
                to={`/mdl/inbox/${file.inbox_message_id}`}
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {t("columns.openInbox")}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        );
      case "created_at":
        return (
          <TableCell className="text-muted-foreground text-sm" key={col}>
            {formatDate(file.created_at)}
          </TableCell>
        );
      case "key":
        return (
          <TableCell
            className="max-w-[200px] truncate text-muted-foreground text-xs"
            key={col}
            title={file.key}
          >
            {file.rel_key ?? file.key}
          </TableCell>
        );
      default:
        return null;
    }
  }

  return (
    <TableRow
      className={`group cursor-pointer ${ctx.compact ? "[&>td]:!py-1.5" : ""}`}
      data-state={ctx.selectedIds.has(file.key) ? "selected" : undefined}
      onClick={() => ctx.onRowClick(file)}
      onDoubleClick={() => ctx.onOpenFull?.(file)}
    >
      <TableSelectionCell
        aria-label={`Select ${file.filename}`}
        checked={ctx.selectedIds.has(file.key)}
        compact={ctx.compact}
        hoverReveal
        id={file.key}
        onCheckedChange={ctx.onSelectOne}
      />
      {/* The indent rides on the thumbnail cell, which is always the first
          cell after selection — indenting the filename column instead would
          lose the nesting whenever the user reorders columns. */}
      <TableCell>
        <div
          className="flex items-center"
          style={depth > 0 ? { paddingLeft: depth * INDENT_STEP } : undefined}
        >
          <RowThumbnail bucket={ctx.bucket} file={file} />
        </div>
      </TableCell>
      {ctx.visibleColumns.map((col) => renderCell(col))}
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              ctx.onDownload(file.key, file.filename);
            }}
            size="icon"
            title={t("actions.download")}
            variant="ghost"
          >
            <AnimatedDownloadIcon label={t("actions.download")} size="sm" />
          </Button>
          <Button
            className="h-7 w-7 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              ctx.onDelete(file.key);
            }}
            size="icon"
            title={t("actions.delete")}
            variant="ghost"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * A folder row plus, when open, its children — recursively.
 *
 * Each branch owns its own query rather than the page fetching the whole tree
 * up front: a bucket is arbitrarily deep and mostly unvisited, so the tree
 * costs one request per folder the user actually opens. The query is keyed by
 * prefix, so a folder closed and reopened is served from cache.
 *
 * The chevron toggles; the row still navigates into the folder. Both are worth
 * having — expanding compares two folders side by side, drilling in gives one
 * folder the whole table and the breadcrumb path back out.
 */
function FolderBranch({
  ctx,
  depth,
  folder,
}: {
  ctx: RowContext;
  depth: number;
  folder: FilesFolderInfo;
}) {
  const { t } = useTranslation("files");
  const isOpen = ctx.expandedPrefixes.has(folder.prefix);

  const { data, isLoading } = useQuery({
    ...filesChildrenQueryOptions({ bucket: ctx.bucket, prefix: folder.prefix }),
    enabled: isOpen,
  });

  const childFolders = data?.folders ?? [];
  const childFiles = sortFilesBy(
    (data?.files ?? []).map((f) => ({ ...f, id: f.key })),
    ctx.sortBy,
    ctx.sortOrder
  );
  const isEmpty =
    isOpen &&
    !isLoading &&
    childFolders.length === 0 &&
    childFiles.length === 0;

  return (
    <>
      <TableRow
        className={`group cursor-pointer ${ctx.compact ? "[&>td]:!py-1.5" : ""}`}
        onClick={() => ctx.onOpenFolder?.(folder.prefix)}
        onFocus={() => ctx.onPrefetchFolder?.(folder.prefix)}
        onMouseEnter={() => ctx.onPrefetchFolder?.(folder.prefix)}
      >
        <TableCell />
        <TableCell
          className="font-medium"
          colSpan={ctx.visibleColumns.length + 2}
        >
          <div
            className="flex items-center gap-1.5"
            style={depth > 0 ? { paddingLeft: depth * INDENT_STEP } : undefined}
          >
            <button
              aria-expanded={isOpen}
              aria-label={
                isOpen
                  ? t("tree.collapse", { name: folder.name })
                  : t("tree.expand", { name: folder.name })
              }
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                ctx.onToggleFolder(folder.prefix);
              }}
              type="button"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
            </button>
            {isOpen ? (
              <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate" title={folder.title ?? folder.name}>
              {folder.name}
            </span>
          </div>
        </TableCell>
      </TableRow>

      {isOpen && isLoading ? (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell colSpan={ctx.visibleColumns.length + 2}>
            <div style={{ paddingLeft: (depth + 1) * INDENT_STEP }}>
              <Skeleton className="h-4 w-40" />
            </div>
          </TableCell>
        </TableRow>
      ) : null}

      {isEmpty ? (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell
            className="text-muted-foreground text-sm"
            colSpan={ctx.visibleColumns.length + 2}
          >
            <div style={{ paddingLeft: (depth + 1) * INDENT_STEP }}>
              {t("tree.emptyFolder")}
            </div>
          </TableCell>
        </TableRow>
      ) : null}

      {isOpen
        ? childFolders.map((child) => (
            <FolderBranch
              ctx={ctx}
              depth={depth + 1}
              folder={child}
              key={child.prefix}
            />
          ))
        : null}

      {isOpen
        ? childFiles.map((file) => (
            <FileRow ctx={ctx} depth={depth + 1} file={file} key={file.key} />
          ))
        : null}
    </>
  );
}

export function FilesTable({
  bucket,
  files,
  folders,
  columnOrder,
  columnVisibility,
  expandedPrefixes,
  sortBy,
  sortOrder,
  tableSize,
  selectedIds,
  onSelectAll,
  onSelectOne,
  onSortChange,
  onOpenFolder,
  onOpenFull,
  onPrefetchFolder,
  onRowClick,
  onToggleFolder,
  onDownload,
  onDelete,
}: FilesTableProps) {
  const { t } = useTranslation("files");
  const compact = tableSize === "compact";
  const visibleColumns = columnOrder.filter((k) => columnVisibility[k]);

  const allSelected = files.length > 0 && selectedIds.size === files.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < files.length;

  const ctx: RowContext = {
    bucket,
    compact,
    expandedPrefixes,
    onDelete,
    onDownload,
    onOpenFolder,
    onOpenFull,
    onPrefetchFolder,
    onRowClick,
    onSelectOne,
    onToggleFolder,
    selectedIds,
    sortBy,
    sortOrder,
    visibleColumns,
  };

  return (
    // `select-none`: rows are objects to click, not prose. Without it a drag
    // across the list highlights characters and hands the browser's own
    // "Select all" (⌘A) the page text instead of the files.
    <Table className="select-none" noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={`group border-b-0 hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
        >
          <TableSelectionHeader
            aria-label={t("actions.selectAll", { defaultValue: "Select all" })}
            checked={
              someSelected && !allSelected ? "indeterminate" : allSelected
            }
            compact={compact}
            onCheckedChange={onSelectAll}
          />
          <TableHead className="w-10" />
          {visibleColumns.map((col) => {
            const sortColumn = FILES_COLUMN_TO_SORT[col];
            if (sortColumn) {
              return (
                <TableSortableHeader<FilesSortColumn>
                  column={sortColumn}
                  compact={compact}
                  key={col}
                  onSort={onSortChange}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                >
                  {t(`columns.${col}`)}
                </TableSortableHeader>
              );
            }
            return (
              <TableHead
                className={
                  col === "module" || col === "inbox_message"
                    ? "w-36"
                    : undefined
                }
                key={col}
              >
                {t(`columns.${col}`)}
              </TableHead>
            );
          })}
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {folders?.map((folder) => (
          <FolderBranch
            ctx={ctx}
            depth={0}
            folder={folder}
            key={folder.prefix}
          />
        ))}
        {files.map((file) => (
          <FileRow ctx={ctx} depth={0} file={file} key={file.key} />
        ))}
      </TableBody>
    </Table>
  );
}
