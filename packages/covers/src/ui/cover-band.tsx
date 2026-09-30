/**
 * A cover with a header on it — title, subtitle, counts — and, when editable,
 * "Change cover" / "Remove" on hover. With no cover set, the page offers
 * "Add cover" itself (`CoverDialog`) and renders no band.
 *
 * Text colour follows the paint: dark on light colours, white on images,
 * gradients and saturated colours (images also get a bottom scrim so a bright
 * photo cannot swallow the title).
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ImageIcon, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Cover } from "../cover.js";
import { coverIsLight } from "../presets.js";
import { CoverDialog } from "./cover-dialog.js";
import type { CoverMediaAdapter } from "./cover-media-adapter.js";
import {
  coverPaintStyle,
  useResolvedCoverImageUrl,
} from "./use-cover-image-url.js";

const chromeButtonClass =
  "h-7 gap-1.5 bg-background/90 px-2.5 text-foreground text-xs shadow-sm backdrop-blur-sm hover:bg-background";

export function CoverBand({
  className,
  cover,
  editable = false,
  header,
  media,
  minHeight = 200,
  onChange,
  pending = false,
}: {
  className?: string;
  cover: Cover;
  editable?: boolean;
  /** Rendered at the bottom of the band, over the paint. */
  header?: ReactNode;
  media?: CoverMediaAdapter;
  /** Band height while a cover is set. */
  minHeight?: number;
  onChange?: (cover: Cover | null) => void;
  pending?: boolean;
}) {
  const { t } = useTranslation("common");
  const [dialogOpen, setDialogOpen] = useState(false);
  const imageUrl = useResolvedCoverImageUrl(cover);
  const canEdit = editable && Boolean(onChange);
  const light = coverIsLight(cover);

  const dialog =
    canEdit && onChange ? (
      <CoverDialog
        currentCover={cover}
        media={media ?? {}}
        onApplyCover={(next) => onChange(next)}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        pending={pending}
      />
    ) : null;

  return (
    <div
      className={cn(
        "group/cover relative flex w-full flex-col justify-end overflow-hidden",
        light ? "text-foreground" : "text-white",
        className
      )}
      style={{ minHeight }}
    >
      {dialog}
      <div
        aria-hidden
        className="absolute inset-0"
        style={coverPaintStyle(cover, imageUrl)}
      />
      {cover.type === "image" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
        />
      ) : null}
      {canEdit ? (
        <div className="absolute top-3 right-3 z-10 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/cover:opacity-100">
          <Button
            className={chromeButtonClass}
            disabled={pending}
            onClick={() => setDialogOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <ImageIcon aria-hidden className="size-3.5" />
            {t("covers.change_cover_hint")}
          </Button>
          <Button
            className={chromeButtonClass}
            disabled={pending}
            onClick={() => onChange?.(null)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 aria-hidden className="size-3.5" />
            {t("covers.remove_cover")}
          </Button>
        </div>
      ) : null}
      {header ? <div className="relative z-10">{header}</div> : null}
    </div>
  );
}
