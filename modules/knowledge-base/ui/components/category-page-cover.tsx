/**
 * Category view page cover band.
 *
 * Opens the same cover picker (`CoverDialog`) the KB hub uses, but persists the
 * resulting `Cover` on the **category** row via `useUpdateCategoryMutation`.
 * Layout mirrors `KbHubCover` so the category page reads as a sibling surface
 * to the KB hub.
 */

import { COVER_H, COVER_H_EMPTY, type Cover } from "@engenty/covers";
import {
  CoverDialog,
  coverPaintStyle,
  createCoverMediaHttpAdapter,
  useResolvedCoverImageUrl,
} from "@engenty/covers/ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ImageIcon, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import type { KbCategory } from "../../src/schema/types.js";
import { kbModuleHubCoverInnerClassName } from "../lib/kb-page-shell.js";
import { useUpdateCategoryMutation } from "../queries.js";
import {
  KbHubCoverDialogApiContext,
  useKbHubCoverDialogApi,
} from "./kb-hub-cover-dialog-context.js";

interface CategoryPageCoverProps {
  category: KbCategory;
  className?: string;
  /** When false, hide cover edit controls (view mode). */
  editable?: boolean;
  header?: ReactNode;
  onOptimisticCoverChange?: (cover: Cover | null) => void;
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

  const coverMedia = useMemo(
    () =>
      createCoverMediaHttpAdapter({
        basePath: "/api/kb/cover",
        ownerField: "kb_id",
        ownerId: category.kb_id,
      }),
    [category.kb_id]
  );

  const cover = category.cover;
  const hasCover = Boolean(cover);
  const resolvedImageUrl = useResolvedCoverImageUrl(cover ?? null);

  const coverStyle = coverPaintStyle(cover, resolvedImageUrl);

  const applyCover = (next: Cover | null) => {
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
      <CoverDialog
        currentCover={cover}
        media={coverMedia}
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
        style={{ minHeight: hasCover ? COVER_H : COVER_H_EMPTY }}
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
                    {t("covers.change_cover_hint", { ns: "common" })}
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
                    {t("covers.remove_cover", { ns: "common" })}
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
      {t("covers.add_cover_hint", { ns: "common" })}
    </Button>
  );
}
