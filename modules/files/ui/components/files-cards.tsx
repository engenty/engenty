import { useTranslation } from "@engenty/i18n/ui";
import {
  adminListCardsGridClassName,
  Badge,
  Checkbox,
  cn,
} from "@engenty/ui-core";
import { Folder, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import {
  type FilesFolderInfo,
  isFileStorageThumbnailSourceMime,
} from "../api.js";
import type { FilesFileWithId } from "./file-columns.js";
import {
  formatBytes,
  formatDate,
  getFileIcon,
  getMimeLabel,
  isPreviewableImage,
} from "./file-helpers.js";
import { CardDocThumbnail, CardThumbnail } from "./file-thumbnails.js";

interface FilesCardsProps {
  bucket: string;
  files: FilesFileWithId[];
  folders?: FilesFolderInfo[];
  onCardClick: (file: FilesFileWithId) => void;
  onOpenFolder?: (prefix: string) => void;
  onOpenFull?: (file: FilesFileWithId) => void;
  onPrefetchFolder?: (prefix: string) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  selectedIds: Set<string>;
  tableSize: "compact" | "normal";
}

function CardPreview({
  bucket,
  file,
}: {
  bucket: string;
  file: FilesFileWithId;
}) {
  const Icon = getFileIcon(file.mime_type);
  if (isPreviewableImage(file.mime_type)) {
    return (
      <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-md bg-muted/30">
        <CardThumbnail fileKey={file.key} filename={file.filename} />
      </div>
    );
  }
  if (isFileStorageThumbnailSourceMime(file.mime_type)) {
    return (
      <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-md bg-muted/30">
        <CardDocThumbnail bucket={bucket} fileKey={file.key} />
      </div>
    );
  }
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted/50">
      <Icon className="h-8 w-8 text-muted-foreground" />
    </div>
  );
}

export function FilesCards({
  bucket,
  files,
  folders,
  selectedIds,
  tableSize,
  onSelectOne,
  onCardClick,
  onOpenFolder,
  onOpenFull,
  onPrefetchFolder,
}: FilesCardsProps) {
  const { t } = useTranslation("files");

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {folders?.map((folder) => (
        <button
          className="ui-card-raised group flex items-center gap-3 overflow-hidden p-3 text-left"
          key={folder.prefix}
          onClick={() => onOpenFolder?.(folder.prefix)}
          onFocus={() => onPrefetchFolder?.(folder.prefix)}
          onMouseEnter={() => onPrefetchFolder?.(folder.prefix)}
          type="button"
        >
          <Folder className="h-8 w-8 shrink-0 text-muted-foreground" />
          <span
            className="min-w-0 truncate font-medium text-sm"
            title={folder.title ?? folder.name}
          >
            {folder.name}
          </span>
        </button>
      ))}
      {files.map((file) => {
        const isSelected = selectedIds.has(file.key);
        return (
          <div
            className={cn(
              "ui-card-raised ui-card-interactive group relative cursor-pointer overflow-hidden",
              isSelected && "ui-card-selected"
            )}
            key={file.key}
            onClick={() => onCardClick(file)}
            onDoubleClick={() => onOpenFull?.(file)}
          >
            <div
              className="absolute top-2 left-2 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                aria-label={`Select ${file.filename}`}
                checked={isSelected}
                className={`${isSelected || "opacity-0 group-hover:opacity-100"} transition-opacity`}
                onCheckedChange={(checked) =>
                  onSelectOne(file.key, checked === true)
                }
              />
            </div>
            <div className="flex flex-col items-center gap-2 p-3 pt-5 pb-1">
              <CardPreview bucket={bucket} file={file} />
              <p
                className="w-full truncate text-center font-medium text-xs"
                title={file.filename}
              >
                {file.filename}
              </p>
              {file.path_label ? (
                <p
                  className="w-full truncate px-1 text-center text-muted-foreground text-xxs"
                  title={file.key}
                >
                  {file.path_label}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-1 px-3 pt-1">
              <Badge className="text-xxs" variant="secondary">
                {getMimeLabel(file.mime_type)}
              </Badge>
              {file.size_bytes > 0 && (
                <span className="text-muted-foreground text-xxs">
                  {formatBytes(file.size_bytes)}
                </span>
              )}
            </div>
            <p className="mt-1 px-3 text-center text-muted-foreground text-xxs">
              {formatDate(file.created_at)}
            </p>
            {file.inbox_message_id ? (
              <div
                className="px-3 pb-2 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <Link
                  className="inline-flex items-center justify-center gap-1 text-primary text-xxs underline-offset-2 hover:underline"
                  to={`/mdl/inbox/${file.inbox_message_id}`}
                >
                  <Mail className="h-3 w-3" />
                  {t("columns.openInbox")}
                </Link>
              </div>
            ) : (
              <div className="pb-2" />
            )}
          </div>
        );
      })}
    </div>
  );
}
