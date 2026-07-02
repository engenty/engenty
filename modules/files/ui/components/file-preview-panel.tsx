import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { getFilesUrl } from "../api.js";
import { FilePreviewBlock } from "../pages/files-file-preview.js";
import type { FilesFileWithId } from "./file-columns.js";
import { formatBytes, formatDate, getMimeLabel } from "./file-helpers.js";

const PREVIEW_WIDTH_KEY = "files.previewWidth";
const PREVIEW_MIN_WIDTH = 360;
const PREVIEW_DEFAULT_WIDTH = 640;

/** Drag-to-resize width for the preview panel, persisted across sessions. */
function useResizableWidth() {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") {
      return PREVIEW_DEFAULT_WIDTH;
    }
    const saved = Number(window.localStorage.getItem(PREVIEW_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= PREVIEW_MIN_WIDTH
      ? saved
      : PREVIEW_DEFAULT_WIDTH;
  });

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      const max = Math.round(window.innerWidth * 0.95);
      // Panel is anchored right: width grows as the pointer moves left.
      const next = Math.min(
        max,
        Math.max(PREVIEW_MIN_WIDTH, window.innerWidth - ev.clientX)
      );
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      setWidth((w) => {
        window.localStorage.setItem(PREVIEW_WIDTH_KEY, String(w));
        return w;
      });
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return { width, startResize };
}

interface FilePreviewPanelProps {
  bucket: string;
  file: FilesFileWithId | null;
  onClose: () => void;
  onDelete: (key: string) => void;
  onDownload: (key: string, filename: string) => void;
}

export function FilePreviewPanel({
  bucket,
  file,
  onClose,
  onDelete,
  onDownload,
}: FilePreviewPanelProps) {
  const { t } = useTranslation("files");
  const { width, startResize } = useResizableWidth();

  const urlQuery = useQuery({
    queryKey: ["files", "preview-url", bucket, file?.key],
    queryFn: async (): Promise<string | null> => {
      if (!file) {
        return null;
      }
      try {
        const result = await getFilesUrl(file.key, bucket);
        return result.url;
      } catch {
        return null;
      }
    },
    enabled: Boolean(file),
    staleTime: 30_000,
  });

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={Boolean(file)}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-none"
        side="right"
        style={{ width: `${width}px`, maxWidth: "95vw" }}
      >
        {/* Drag handle — resize the panel from its left edge. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 z-50 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
          onPointerDown={startResize}
        />
        {file ? (
          <>
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="truncate" title={file.filename}>
                {file.filename}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <Badge variant="secondary">
                  {getMimeLabel(file.mime_type)}
                </Badge>
                {file.size_bytes > 0 ? (
                  <span className="text-muted-foreground text-xs">
                    {formatBytes(file.size_bytes)}
                  </span>
                ) : null}
                <span className="text-muted-foreground text-xs">
                  {formatDate(file.created_at)}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {urlQuery.isPending ? (
                <div className="flex h-full min-h-[300px] items-center justify-center">
                  <AnimatedLoaderIcon play="always" size={40} />
                </div>
              ) : urlQuery.data ? (
                <FilePreviewBlock
                  fileKey={file.key}
                  filename={file.filename}
                  generatingLabel={t("preview.generating")}
                  loadingLabel={t("preview.loading")}
                  mimeType={file.mime_type}
                  noPreviewLabel={t("preview.noPreview")}
                  truncatedLabel={t("preview.truncated")}
                  url={urlQuery.data}
                />
              ) : (
                <p className="text-destructive text-sm">
                  {t("preview.noPreview")}
                </p>
              )}
              {file.path_label ? (
                <p
                  className="mt-3 truncate text-muted-foreground text-xs"
                  title={file.key}
                >
                  {file.path_label}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2 border-t px-4 py-3">
              <Button
                onClick={() => onDownload(file.key, file.filename)}
                size="sm"
                variant="outline"
              >
                <Download className="mr-1.5 h-4 w-4" />
                {t("actions.download")}
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/files/${encodeURIComponent(file.key)}`}>
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  {t("actions.openDetail", { defaultValue: "Details" })}
                </Link>
              </Button>
              <Button
                className="ml-auto text-destructive"
                onClick={() => onDelete(file.key)}
                size="sm"
                variant="ghost"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t("actions.delete")}
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
