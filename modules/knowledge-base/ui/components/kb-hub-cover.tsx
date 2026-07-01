/**
 * Full-width cover band for the KB hub — displays a color, gradient or image.
 * Shown on the hub index whenever a KB is selected (empty state uses a quiet wash).
 * Hover reveals "Change cover" / "Remove" actions (Notion-style chrome).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ImageIcon, Trash2 } from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import type { KbCover, KnowledgeBase } from "../../src/schema/types.js";
import { kbModuleHubCoverInnerClassName } from "../lib/kb-page-shell.js";
import { KB_COVER_H, KB_COVER_H_EMPTY } from "./kb-hub-cover-constants.js";
import { KbHubCoverDialog } from "./kb-hub-cover-dialog.js";
import {
  KbHubCoverDialogApiContext,
  useKbHubCoverDialogApi,
} from "./kb-hub-cover-dialog-context.js";
import { useResolvedKbCoverImageUrl } from "./kb-hub-cover-image-url.js";
import { useKbCoverMutation } from "./use-kb-cover-mutation.js";

export function KbHubCover({
  kb,
  className,
  editable = false,
  header,
  onCoverMutationError,
  onOptimisticCoverChange,
}: {
  kb: KnowledgeBase;
  className?: string;
  /** When false, hide cover edit controls (view mode). */
  editable?: boolean;
  /** Title / description / icon chrome — rendered over the cover with `surface="on-cover"`. */
  header?: ReactNode;
  onCoverMutationError?: (cover: KbCover | null) => void;
  onOptimisticCoverChange?: (cover: KbCover | null) => void;
}) {
  const { t } = useTranslation("kb");
  const [dialogOpen, setDialogOpen] = useState(false);

  const mutation = useKbCoverMutation(kb, {
    onCoverMutationError,
    onOptimisticCoverChange,
  });

  const dialogApi = useMemo(
    () => ({
      open: () => setDialogOpen(true),
      isPending: mutation.isPending,
    }),
    [mutation.isPending]
  );

  const cover = kb.cover;
  const hasCover = Boolean(cover);
  const resolvedImageUrl = useResolvedKbCoverImageUrl(cover ?? null);

  const coverStyle: CSSProperties =
    cover?.type === "image" && resolvedImageUrl
      ? {
          backgroundImage: `url(${resolvedImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : cover?.type === "color"
        ? { backgroundColor: cover.value }
        : cover?.type === "gradient"
          ? { background: cover.value }
          : {};

  return (
    <KbHubCoverDialogApiContext.Provider value={dialogApi}>
      <KbHubCoverDialog
        currentCover={cover}
        kbId={kb.id}
        kbSlug={kb.slug}
        onApplyCover={(next) => mutation.mutate(next)}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        pending={mutation.isPending}
      />
      <div
        className={cn(
          "group/cover relative flex min-h-0 w-full shrink-0 flex-col overflow-hidden",
          className
        )}
        style={{ minHeight: hasCover ? KB_COVER_H : KB_COVER_H_EMPTY }}
      >
        {hasCover ? (
          <div
            aria-hidden
            className="absolute inset-0 z-0"
            style={coverStyle}
          />
        ) : null}
        {/*
         * Legibility scrim for image covers only.
         *
         * Photos have arbitrary luminance distributions, so the white title /
         * description sitting on top can easily disappear into bright spots.
         * A soft bottom-anchored gradient darkens just the bottom band where
         * the text sits, leaving the upper portion of the image clean.
         *
         * Color / gradient covers are excluded: their text color is chosen
         * dynamically via `kbCoverIsLight`, so they don't need a scrim — and
         * adding one on a vibrant solid would mute the chosen tone.
         */}
        {cover?.type === "image" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
          />
        ) : null}

        <div className="relative z-10 shrink-0 pt-11 sm:pt-12" />

        <div className="relative z-10 mt-auto flex min-h-0 w-full flex-1 flex-col justify-end">
          {header ? (
            <div className={kbModuleHubCoverInnerClassName}>
              <div className="min-w-0 flex-1 pb-0.5">{header}</div>
              {editable && hasCover ? (
                <div className="flex shrink-0 items-center justify-end gap-1.5 self-end pb-0.5 opacity-0 transition-opacity duration-150 group-hover/cover:opacity-100">
                  <Button
                    className="h-7 gap-1.5 bg-background/90 px-2.5 text-xs shadow-sm backdrop-blur-sm hover:bg-background"
                    disabled={mutation.isPending}
                    onClick={() => setDialogOpen(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <ImageIcon aria-hidden className="size-3.5" />
                    {t("hub.change_cover_hint")}
                  </Button>

                  <Button
                    className="h-7 gap-1.5 bg-background/90 px-2.5 text-xs shadow-sm backdrop-blur-sm hover:bg-background"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(null)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                    {t("hub.remove_cover")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </KbHubCoverDialogApiContext.Provider>
  );
}

/**
 * Minimal "Add cover" trigger rendered inside the header action bar when
 * no cover is set — keeps the cover picker accessible when the hub band is scrolled away.
 */
export function KbHubAddCoverButton({
  kb: _kb,
  className,
  onCoverMutationError: _onCoverMutationError,
  onOptimisticCoverChange: _onOptimisticCoverChange,
}: {
  kb: KnowledgeBase;
  className?: string;
  onCoverMutationError?: (cover: KbCover | null) => void;
  onOptimisticCoverChange?: (cover: KbCover | null) => void;
}) {
  const { t } = useTranslation("kb");
  const dialogApi = useKbHubCoverDialogApi();

  if (!dialogApi) {
    return null;
  }

  return (
    <Button
      // Match the sibling hover-bar buttons in `KbHubKbHeaderInline` ("Add
      // icon" / "Add description"): low-contrast chrome by default, firming up
      // on direct hover. `className` from the caller (e.g. on-cover white
      // tint) merges last and wins via tailwind-merge.
      className={cn(
        "h-7 gap-1.5 px-2.5 text-muted-foreground/60 text-xs hover:text-muted-foreground",
        className
      )}
      disabled={dialogApi.isPending}
      onClick={() => dialogApi.open()}
      size="sm"
      type="button"
      variant="ghost"
    >
      <ImageIcon aria-hidden className="size-3.5" />
      {t("hub.add_cover_hint")}
    </Button>
  );
}
