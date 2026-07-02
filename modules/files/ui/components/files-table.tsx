import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
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
import { ChevronRight, Folder, Mail, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  type FilesFolderInfo,
  isFileStorageThumbnailSourceMime,
} from "../api.js";
import {
  FILES_COLUMN_TO_SORT,
  type FilesColumnKey,
  type FilesColumnVisibility,
  type FilesFileWithId,
  type FilesSortColumn,
} from "./file-columns.js";
import {
  formatBytes,
  formatDate,
  getFileIcon,
  getMimeLabel,
  isPreviewableImage,
} from "./file-helpers.js";
import { CardDocThumbnail, CardThumbnail } from "./file-thumbnails.js";

interface FilesTableProps {
  bucket: string;
  columnOrder: FilesColumnKey[];
  columnVisibility: FilesColumnVisibility;
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
  selectedIds: Set<string>;
  sortBy: FilesSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: "compact" | "normal";
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

export function FilesTable({
  bucket,
  files,
  folders,
  columnOrder,
  columnVisibility,
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
  onDownload,
  onDelete,
}: FilesTableProps) {
  const { t } = useTranslation("files");
  const compact = tableSize === "compact";
  const visibleColumns = columnOrder.filter((k) => columnVisibility[k]);
  /** Folder rows + the leading thumbnail column span the file's data columns. */
  const folderNameColSpan = visibleColumns.length + 1;

  const allSelected = files.length > 0 && selectedIds.size === files.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < files.length;

  function renderCell(col: FilesColumnKey, file: FilesFileWithId) {
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
    <Table noWrapper>
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
          <TableRow
            className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : ""}`}
            key={folder.prefix}
            onClick={() => onOpenFolder?.(folder.prefix)}
            onFocus={() => onPrefetchFolder?.(folder.prefix)}
            onMouseEnter={() => onPrefetchFolder?.(folder.prefix)}
          >
            <TableCell />
            <TableCell>
              <Folder className="h-5 w-5 text-muted-foreground" />
            </TableCell>
            <TableCell className="font-medium" colSpan={folderNameColSpan}>
              <span className="inline-flex items-center gap-1">
                {folder.name}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              </span>
            </TableCell>
          </TableRow>
        ))}
        {files.map((file) => (
          <TableRow
            className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : ""}`}
            data-state={selectedIds.has(file.key) ? "selected" : undefined}
            key={file.key}
            onClick={() => onRowClick(file)}
            onDoubleClick={() => onOpenFull?.(file)}
          >
            <TableSelectionCell
              aria-label={`Select ${file.filename}`}
              checked={selectedIds.has(file.key)}
              compact={compact}
              hoverReveal
              id={file.key}
              onCheckedChange={onSelectOne}
            />
            <TableCell>
              <RowThumbnail bucket={bucket} file={file} />
            </TableCell>
            {visibleColumns.map((col) => renderCell(col, file))}
            <TableCell>
              <div className="flex items-center gap-1">
                <Button
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(file.key, file.filename);
                  }}
                  size="icon"
                  title={t("actions.download")}
                  variant="ghost"
                >
                  <AnimatedDownloadIcon
                    label={t("actions.download")}
                    size="sm"
                  />
                </Button>
                <Button
                  className="h-7 w-7 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(file.key);
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
        ))}
      </TableBody>
    </Table>
  );
}
