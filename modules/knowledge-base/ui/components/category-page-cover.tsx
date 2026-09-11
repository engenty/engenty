/**
 * Category view page cover band.
 *
 * Wraps the same {@link KbHubCoverDialog} the KB hub uses, but persists the
 * resulting `KbCover` on the **category** row via `useUpdateCategoryMutation`.
 * Layout mirrors `KbHubCover` so the category page reads as a sibling surface
 * to the KB hub.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ImageIcon, Trash2 } from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import type { KbCategory, KbCover } from "../../src/schema/types.js";
import { kbModuleHubCoverInnerClassName } from "../lib/kb-page-shell.js";
import { useUpdateCategoryMutation } from "../queries.js";
import { KB_COVER_H, KB_COVER_H_EMPTY } from "./kb-hub-cover-constants.js";
import { KbHubCoverDialog } from "./kb-hub-cover-dialog.js";
import {
  KbHubCoverDialogApiContext,
  useKbHubCoverDialogApi,
} from "./kb-hub-cover-dialog-context.js";
import { useResolvedKbCoverImageUrl } from "./kb-hub-cover-image-url.js";

interface CategoryPageCoverProps {
  category: KbCategory;
  className?: string;
  /** When false, hide cover edit controls (view mode). */
  editable?: boolean;
  header?: ReactNode;
  onOptimisticCoverChange?: (cover: KbCover | null) => void;
}

export function CategoryPageCover({
  category,
  className,
  editable = true,
  header,
  onOptimisticCoverChange,
}: CategoryPageCoverProps) {
  const { t } = useTranslation("kb");
  const [dialogOpen, setDialogOpen] = useState(false);

  const mutation = useUpdateCategoryMutation(category.kb_id);

  const dialogApi = useMemo(
    () => ({
      open: () => setDialogOpen(true),
      isPending: mutation.isPending,
    }),
    [mutation.isPending]
  );

  const cover = category.cover;
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

  const applyCover = (next: KbCover | null) => {
    onOptimisticCoverChange?.(next);
    mutation.mutate({
      id: category.id,
      input: next
        ? { cover: next }
        : { cover: null, cover_inheritance: "none" },
    });
  };

  return (
    <KbHubCoverDialogApiContext.Provider value={dialogApi}>
      <KbHubCoverDialog
        currentCover={cover}
        kbId={category.kb_id}
        onApplyCover={(next) => applyCover(next)}
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
                    onClick={() => applyCover(null)}
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

/** "Add cover" affordance for the header action bar when no cover is set. */
export function CategoryPageAddCoverButton({
  className,
}: {
  className?: string;
}) {
  const { t } = useTranslation("kb");
  const dialogApi = useKbHubCoverDialogApi();

  if (!dialogApi) {
    return null;
  }

  return (
    <Button
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
