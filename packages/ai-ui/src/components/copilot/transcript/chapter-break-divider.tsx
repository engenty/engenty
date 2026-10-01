"use client";

// The line where a conversation started over (`/chapter`). Above it, folded
// or not, is the chapter it closed; the title opens that chapter's summary
// (`?chapter=<id>`, ThreadChapterCard). A cut in flight draws the line
// before the chapter exists; one that did not land says why instead.

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Scissors } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  THREAD_CHAPTER_QUERY,
  type ThreadChapter,
} from "../../../copilot/thread-chapters-api.js";
import type { ChapterCutState } from "../../../copilot/use-transcript-chapter-break.js";
import { Shimmer } from "../../ai-elements/shimmer";

function ChapterLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex w-full items-center gap-3", className)}
      data-testid="chapter-break"
    >
      <span aria-hidden className="h-px flex-1 bg-border" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

export function ChapterBreakDivider({
  chapter,
  className,
}: {
  chapter: ThreadChapter;
  className?: string;
}) {
  const { t } = useTranslation("ai-ui");
  const [, setSearchParams] = useSearchParams();
  return (
    <ChapterLine className={className}>
      <button
        className="inline-flex min-w-0 max-w-[70%] items-center gap-1.5 rounded-md px-2 py-0.5 text-muted-foreground text-xs hover:bg-muted/60 hover:text-foreground"
        onClick={() =>
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set(THREAD_CHAPTER_QUERY, chapter.id);
            return next;
          })
        }
        type="button"
      >
        <Scissors aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">
          {t("chapterBreak.label", { title: chapter.title })}
        </span>
      </button>
    </ChapterLine>
  );
}

/** A cut in flight, or one that did not land — at the end of the stream. */
export function ChapterCutStatus({
  className,
  state,
}: {
  className?: string;
  state: ChapterCutState;
}) {
  const { t } = useTranslation("ai-ui");
  if (state === "pending") {
    return (
      <ChapterLine className={className}>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-muted-foreground text-xs">
          <Scissors aria-hidden className="size-3.5 shrink-0" />
          <Shimmer as="span" duration={2} spread={2}>
            {t("chapterBreak.closing")}
          </Shimmer>
        </span>
      </ChapterLine>
    );
  }
  return (
    <p
      className={cn("text-center text-muted-foreground text-xs", className)}
      data-testid="chapter-cut-status"
    >
      {state === "nothingNew"
        ? t("river.nothingToCompact")
        : t("chapterBreak.failed")}
    </p>
  );
}
