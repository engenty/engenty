/**
 * Read-only cover band (color, gradient, or image) with optional header chrome.
 * Shared by category view pages and articles with inherited category covers.
 */

import { cn } from "@engenty/ui-core";
import type { CSSProperties, ReactNode } from "react";
import type { KbCover } from "../../src/schema/types.js";
import { kbModuleHubCoverInnerClassName } from "../lib/kb-page-shell.js";
import { KB_COVER_H, KB_COVER_H_EMPTY } from "./kb-hub-cover-constants.js";
import { useResolvedKbCoverImageUrl } from "./kb-hub-cover-image-url.js";

export function KbCoverBandDisplay({
  cover,
  className,
  header,
  minHeightWhenEmpty = KB_COVER_H_EMPTY,
}: {
  cover: KbCover;
  className?: string;
  header?: ReactNode;
  /** Min height when `header` is set but cover paint is missing (should not happen). */
  minHeightWhenEmpty?: number;
}) {
  const resolvedImageUrl = useResolvedKbCoverImageUrl(cover);

  const coverStyle: CSSProperties =
    cover.type === "image" && resolvedImageUrl
      ? {
          backgroundImage: `url(${resolvedImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : cover.type === "color"
        ? { backgroundColor: cover.value }
        : cover.type === "gradient"
          ? { background: cover.value }
          : {};

  return (
    <div
      className={cn(
        "relative flex min-h-0 w-full shrink-0 flex-col overflow-hidden",
        className
      )}
      style={{ minHeight: header ? minHeightWhenEmpty : KB_COVER_H }}
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
