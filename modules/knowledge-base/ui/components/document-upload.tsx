/**
 * KB Document Upload — file picker + full-column drop target (article editor column).
 */

import { getCurrentAccessToken } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { FileUp, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
];

const ACCEPT_STRING = ACCEPTED_TYPES.join(",");

export interface ConvertedDocument {
  filename: string;
  markdown: string;
  originalMimeType?: string;
  /** Vault storage path of the original file (when uploaded to vault). */
  originalStoragePath?: string | null;
}

interface DocumentUploadProps {
  /** Rendered after the upload button (e.g. attachment status), still inside the drop column. */
  belowControls?: ReactNode;
  /** Main editor column: entire region accepts file drops when dragging over it. */
  children?: ReactNode;
  disabled?: boolean;
  /** When provided, the original is persisted to vault under this KB. */
  kbId?: string;
  onConverted?: (result: ConvertedDocument) => void;
}

export function DocumentUpload({
  onConverted,
  disabled,
  kbId,
  children,
  belowControls,
}: DocumentUploadProps) {
  const { t } = useTranslation("kb");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [highlightDrop, setHighlightDrop] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (kbId) {
          formData.append("kb_id", kbId);
        }

        const token = (await getCurrentAccessToken())?.trim() ?? "";
        const response = await fetch("/api/kb/convert-document", {
          method: "POST",
          headers: token ? { authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (!response.ok) {
          const errBody = (await response.json().catch(() => null)) as {
            error?: string | { message?: string };
          } | null;
          const msg = errBody?.error;
          throw new Error(
            (typeof msg === "string"
              ? msg
              : (msg as { message?: string } | undefined)?.message) ??
              `Upload failed (${response.status})`
          );
        }

        const body = (await response.json()) as {
          ok?: boolean;
          data?: {
            markdown?: string;
            original?: { storage_path: string; mime_type: string } | null;
          };
          markdown?: string;
          original?: { storage_path: string; mime_type: string } | null;
        };
        const data = body.data ?? body;
        onConverted?.({
          filename: file.name,
          markdown: data.markdown ?? "",
          originalStoragePath: data.original?.storage_path ?? null,
          originalMimeType: data.original?.mime_type,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to convert document"
        );
      } finally {
        setUploading(false);
      }
    },
    [onConverted, kbId]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const clearHighlight = useCallback(() => setHighlightDrop(false), []);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (disabled || uploading) {
        setHighlightDrop(false);
        return;
      }
      if (!e.dataTransfer?.types.includes("Files")) {
        return;
      }
      const el = rootRef.current;
      if (!el) {
        return;
      }
      const r = el.getBoundingClientRect();
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      setHighlightDrop(inside);
      if (inside) {
        e.preventDefault();
      }
    };

    const onDragEndOrLeaveWindow = () => setHighlightDrop(false);

    window.addEventListener("dragover", onDragOver, { passive: false });
    window.addEventListener("dragend", onDragEndOrLeaveWindow);
    window.addEventListener("drop", onDragEndOrLeaveWindow);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", onDragEndOrLeaveWindow);
      window.removeEventListener("drop", onDragEndOrLeaveWindow);
    };
  }, [disabled, uploading]);

  const onDropCapture = (e: React.DragEvent) => {
    if (disabled || uploading) {
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    void handleFile(file);
    clearHighlight();
  };

  const onDragOverCapture = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
    }
  };

  const showDropOverlay =
    highlightDrop && !disabled && !uploading && Boolean(children);

  const controls = (
    <div className="flex flex-col gap-2">
      <Button
        className="w-fit"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
      >
        {uploading ? (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        ) : (
          <FileUp className="mr-2 h-4 w-4" />
        )}
        {t("article.actions.upload_document")}
      </Button>
      <p className="text-muted-foreground text-xxs">
        PDF, DOCX, PPTX, TXT, MD —{" "}
        {t("article.upload.hint_short", "or drag files onto the window")}
      </p>

      {error && (
        <div className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-destructive text-xs">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} type="button">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <input
        accept={ACCEPT_STRING}
        className="hidden"
        disabled={disabled || uploading}
        onChange={handleInputChange}
        ref={inputRef}
        type="file"
      />
    </div>
  );

  if (children === undefined && belowControls === undefined) {
    return (
      <div
        className="relative flex flex-col"
        onDragOverCapture={onDragOverCapture}
        onDropCapture={onDropCapture}
        ref={rootRef}
      >
        {controls}
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col"
      onDragOverCapture={onDragOverCapture}
      onDropCapture={onDropCapture}
      ref={rootRef}
    >
      {children}
      <div className={children === undefined ? undefined : "mt-6"}>
        {controls}
      </div>
      {belowControls ? <div className="mt-4">{belowControls}</div> : null}

      {showDropOverlay ? (
        <div
          aria-hidden={false}
          className="fade-in pointer-events-none absolute inset-0 z-20 flex animate-in flex-col items-center justify-center gap-2 rounded-lg border-2 border-primary/60 border-dashed bg-background/90 p-8"
        >
          <FileUp className="h-10 w-10 text-primary" />
          <p className="font-medium text-sm">
            {t("article.upload.drop_here", "Drop files to convert")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
