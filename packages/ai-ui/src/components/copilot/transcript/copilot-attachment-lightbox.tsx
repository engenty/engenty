"use client";

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@engenty/ui-core";
import { Copy, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export type CopilotAttachmentLightboxKind = "image" | "pdf";

export interface CopilotAttachmentLightboxTarget {
  filename: string;
  kind: CopilotAttachmentLightboxKind;
  url: string;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

function downloadFromUrl(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function copyAttachment(
  url: string,
  kind: CopilotAttachmentLightboxKind
) {
  if (kind === "image" && typeof ClipboardItem !== "undefined") {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || "image/png"]: blob }),
      ]);
      return;
    } catch {
      // Fall through to copying the URL.
    }
  }
  await navigator.clipboard.writeText(url);
}

function ToolbarButton({
  atLimit,
  disabled,
  label,
  onClick,
  children,
}: {
  atLimit?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Button
      aria-disabled={atLimit || disabled || undefined}
      aria-label={label}
      className={atLimit ? "opacity-50" : undefined}
      disabled={disabled}
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

/** Full-size image or PDF preview for a chat attachment. */
export function CopilotAttachmentLightbox({
  onOpenChange,
  target,
}: {
  onOpenChange: (open: boolean) => void;
  target: CopilotAttachmentLightboxTarget | null;
}) {
  const { t } = useTranslation("common");
  const [zoom, setZoom] = useState(1);
  const kind = target?.kind ?? "image";
  const label =
    target?.filename.trim() ||
    t(
      kind === "pdf"
        ? "copilot.attachments.untitledFile"
        : "copilot.attachments.untitledImage"
    );
  const src = target?.url ?? null;

  useEffect(() => {
    setZoom(1);
  }, [src]);

  const zoomOut = () =>
    setZoom((value) =>
      Math.max(ZOOM_MIN, Number((value - ZOOM_STEP).toFixed(2)))
    );
  const zoomIn = () =>
    setZoom((value) =>
      Math.min(ZOOM_MAX, Number((value + ZOOM_STEP).toFixed(2)))
    );

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(target)}>
      <DialogContent
        className="flex h-[96vh] max-h-[96vh] w-[96vw] max-w-[96vw] flex-col gap-3 p-4 sm:max-w-[96vw]"
        showCloseButton={false}
      >
        <div className="flex shrink-0 items-center gap-3">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm">
            {label}
          </DialogTitle>
          <div
            className="flex shrink-0 items-center"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
          >
            <ToolbarButton
              atLimit={!src || zoom <= ZOOM_MIN}
              label={t("copilot.attachments.zoomOut")}
              onClick={zoomOut}
            >
              <ZoomOut />
            </ToolbarButton>
            <ToolbarButton
              atLimit={!src || zoom >= ZOOM_MAX}
              label={t("copilot.attachments.zoomIn")}
              onClick={zoomIn}
            >
              <ZoomIn />
            </ToolbarButton>
            <ToolbarButton
              disabled={!src}
              label={t("copilot.attachments.copy")}
              onClick={() => {
                if (!src) {
                  return;
                }
                void copyAttachment(src, kind);
              }}
            >
              <Copy />
            </ToolbarButton>
            <ToolbarButton
              disabled={!src}
              label={t("copilot.attachments.download")}
              onClick={() => {
                if (!src) {
                  return;
                }
                downloadFromUrl(src, label);
              }}
            >
              <Download />
            </ToolbarButton>
            <DialogClose
              render={<Button size="icon-sm" type="button" variant="ghost" />}
            >
              <X />
              <span className="sr-only">{t("actions.close")}</span>
            </DialogClose>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 select-none items-center justify-center overflow-auto rounded-md bg-muted/30">
          {src && kind === "pdf" ? (
            <iframe
              className="h-full min-h-0 w-full origin-center border-0 bg-background"
              src={src}
              style={{ transform: `scale(${zoom})` }}
              title={label}
            />
          ) : src ? (
            // biome-ignore lint/correctness/useImageSize: attachment preview scales to viewport; dimensions unknown until load
            <img
              alt={label}
              className="pointer-events-none max-h-full w-auto max-w-full origin-center select-none object-contain transition-transform"
              draggable={false}
              src={src}
              style={{ transform: `scale(${zoom})` }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
