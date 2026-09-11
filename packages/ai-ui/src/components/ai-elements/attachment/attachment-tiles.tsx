"use client";

// Presentational attachment tiles shared by the composer preview and the chat
// transcript. Images: `fit="cover"` square thumbs (composer) or `fit="natural"`
// in the stream. Files: `AttachmentFileTile` / `AttachmentFileBadge`.
// `onPreview` wins over `href`. `size` is the square edge for cover thumbs.

import { cn } from "@engenty/ui-core";
import { FileText, Film, Music, X } from "lucide-react";
import type { ComponentType } from "react";

export function isImageMediaType(
  mediaType: string | undefined | null
): boolean {
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

function fileIcon(mediaType: string | undefined): ComponentType<{
  className?: string;
}> {
  if (mediaType?.startsWith("video/")) {
    return Film;
  }
  if (mediaType?.startsWith("audio/")) {
    return Music;
  }
  return FileText;
}

function RemoveButton({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      aria-label={`Remove ${label}`}
      className={cn(
        "absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full",
        "border border-background bg-foreground text-background shadow-sm",
        "opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100"
      )}
      onClick={onRemove}
      type="button"
    >
      <X className="size-3" />
    </button>
  );
}

export type AttachmentTileSize = "lg" | "sm";

const TILE_SIZE_CLASS: Record<AttachmentTileSize, string> = {
  lg: "size-28 rounded-xl",
  sm: "size-16 rounded-lg",
};
const TILE_SIZE_PX: Record<AttachmentTileSize, number> = { lg: 112, sm: 64 };

export type AttachmentImageFit = "cover" | "natural";

export interface AttachmentTileProps {
  className?: string;
  /**
   * `cover` — square crop (composer thumbs). `natural` — original aspect
   * ratio, never upscaled, height-capped (stream).
   */
  fit?: AttachmentImageFit;
  href?: string;
  label: string;
  mediaType?: string;
  /** In-app preview (lightbox). Takes precedence over `href`. */
  onPreview?: () => void;
  onRemove?: () => void;
  /** Accessible name for the preview control; defaults to `label`. */
  previewAriaLabel?: string;
  size?: AttachmentTileSize;
  url?: string;
}

/** Grid variant — square thumbnail (`cover`) or stream-sized image (`natural`). */
export function AttachmentImageTile({
  className,
  fit = "cover",
  href,
  label,
  onPreview,
  onRemove,
  previewAriaLabel,
  size = "sm",
  url,
}: AttachmentTileProps) {
  const natural = fit === "natural";
  const image = (
    <img
      alt={label}
      className={cn(
        natural
          ? "h-auto max-h-80 w-auto max-w-full rounded-xl border border-border bg-muted object-contain shadow-sm"
          : cn(
              TILE_SIZE_CLASS[size],
              "border border-border bg-muted object-cover"
            ),
        className
      )}
      height={natural ? undefined : TILE_SIZE_PX[size]}
      src={url ?? undefined}
      width={natural ? undefined : TILE_SIZE_PX[size]}
    />
  );
  return (
    <div
      className={cn("group relative", natural && "max-w-full")}
      title={label}
    >
      {onPreview ? (
        <button
          aria-label={previewAriaLabel ?? label}
          className="block max-w-full cursor-pointer rounded-[inherit] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onPreview}
          type="button"
        >
          {image}
        </button>
      ) : href ? (
        <a href={href} rel="noreferrer" target="_blank">
          {image}
        </a>
      ) : (
        image
      )}
      {onRemove ? <RemoveButton label={label} onRemove={onRemove} /> : null}
    </div>
  );
}

/** Grid variant — a square file tile (centered type icon, like the image tile). */
export function AttachmentFileTile({
  className,
  href,
  label,
  mediaType,
  onPreview,
  onRemove,
  previewAriaLabel,
  size = "sm",
}: AttachmentTileProps) {
  const Icon = fileIcon(mediaType);
  const interactive = Boolean(onPreview || href);
  const tileClass = cn(
    TILE_SIZE_CLASS[size],
    "flex items-center justify-center border border-border bg-muted/50",
    interactive && "hover:bg-muted",
    className
  );
  const icon = (
    <Icon
      className={cn(
        size === "lg" ? "size-7" : "size-5",
        "text-muted-foreground"
      )}
    />
  );
  return (
    <div className="group relative" title={label}>
      {onPreview ? (
        <button
          aria-label={previewAriaLabel ?? label}
          className={cn(
            tileClass,
            "cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          onClick={onPreview}
          type="button"
        >
          {icon}
        </button>
      ) : href ? (
        <a className={tileClass} href={href} rel="noreferrer" target="_blank">
          {icon}
        </a>
      ) : (
        <div className={tileClass}>{icon}</div>
      )}
      {onRemove ? <RemoveButton label={label} onRemove={onRemove} /> : null}
    </div>
  );
}

/** Inline variant — a file badge pill (icon + filename). */
export function AttachmentFileBadge({
  className,
  href,
  label,
  mediaType,
  onRemove,
}: AttachmentTileProps) {
  const Icon = fileIcon(mediaType);
  const badgeClass = cn(
    "flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5",
    href && "hover:bg-muted/70",
    className
  );
  const inner = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="max-w-40 truncate text-sm">{label}</span>
    </>
  );
  return (
    <div className="group relative" title={label}>
      {href ? (
        <a className={badgeClass} href={href} rel="noreferrer" target="_blank">
          {inner}
        </a>
      ) : (
        <div className={badgeClass}>{inner}</div>
      )}
      {onRemove ? <RemoveButton label={label} onRemove={onRemove} /> : null}
    </div>
  );
}
