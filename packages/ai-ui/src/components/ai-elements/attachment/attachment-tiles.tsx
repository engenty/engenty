"use client";

// Presentational attachment tiles shared by the composer preview and the chat
// transcript, mirroring the AI SDK Elements Attachments component:
//   - grid variant  → separated square tiles: image thumbnails
//     (`AttachmentImageTile`) and icon file tiles (`AttachmentFileTile`) —
//     used in messages
//   - inline variant → compact file badge pills (`AttachmentFileBadge`) —
//     used in the composer input area
// All accept an optional `onRemove` (composer) or `href` (transcript link).
// `size` picks the square edge: "sm" (64px, composer) or "lg" (112px, thread).

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

export interface AttachmentTileProps {
  className?: string;
  href?: string;
  label: string;
  mediaType?: string;
  onRemove?: () => void;
  size?: AttachmentTileSize;
  url?: string;
}

/** Grid variant — a square image thumbnail. */
export function AttachmentImageTile({
  className,
  href,
  label,
  onRemove,
  size = "sm",
  url,
}: AttachmentTileProps) {
  const image = (
    <img
      alt={label}
      className={cn(
        TILE_SIZE_CLASS[size],
        "border border-border bg-muted object-cover",
        className
      )}
      height={TILE_SIZE_PX[size]}
      src={url ?? undefined}
      width={TILE_SIZE_PX[size]}
    />
  );
  return (
    <div className="group relative" title={label}>
      {href ? (
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
  onRemove,
  size = "sm",
}: AttachmentTileProps) {
  const Icon = fileIcon(mediaType);
  const tileClass = cn(
    TILE_SIZE_CLASS[size],
    "flex items-center justify-center border border-border bg-muted/50",
    href && "hover:bg-muted",
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
      {href ? (
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
