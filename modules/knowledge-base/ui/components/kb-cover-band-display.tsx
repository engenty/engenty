/**
 * Read-only cover band (color, gradient, or image) with optional header chrome.
 * Shared by category view pages and articles with inherited category covers.
 */

import { COVER_H, COVER_H_EMPTY, type Cover } from "@engenty/covers";
import { coverPaintStyle, useResolvedCoverImageUrl } from "@engenty/covers/ui";
import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import { kbModuleHubCoverInnerClassName } from "../lib/kb-page-shell.js";

export function KbCoverBandDisplay({
  cover,
  className,
  header,
  minHeightWhenEmpty = COVER_H_EMPTY,
}: {
  cover: Cover;
  className?: string;
  header?: ReactNode;
  /** Min height when `header` is set but cover paint is missing (should not happen). */
  minHeightWhenEmpty?: number;
}) {
  const resolvedImageUrl = useResolvedCoverImageUrl(cover);

  const coverStyle = coverPaintStyle(cover, resolvedImageUrl);

  return (
    <div
      className={cn(
        "relative flex min-h-0 w-full shrink-0 flex-col overflow-hidden",
        className
      )}
      style={{ minHeight: header ? minHeightWhenEmpty : COVER_H }}
    >
      <div aria-hidden className="absolute inset-0 z-0" style={coverStyle} />
      {cover.type === "image" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
        />
      ) : null}

      <div className="relative z-10 shrink-0 pt-11 sm:pt-12" />

      {header ? (
        <div className="relative z-10 mt-auto flex min-h-0 w-full flex-1 flex-col justify-end">
          <div className={kbModuleHubCoverInnerClassName}>
            <div className="min-w-0 flex-1 pb-0.5">{header}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
