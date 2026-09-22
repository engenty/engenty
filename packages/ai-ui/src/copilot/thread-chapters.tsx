"use client";

// The chapters of a conversation, on screen.
//
// `ThreadChaptersList` is the list itself: newest first, each chapter by
// when it was and what it was about, with the spaces it touched; and
// "Compact now" at the top. `ThreadChaptersMenu` puts that list behind one
// icon in the desk's action row — the same icon on the copilot's river and
// on a specialist's desk. `ThreadChapterCard` is one chapter opened
// (`?chapter=<id>`) — the summary and what to keep in mind — above the
// transcript. Outside a space the copilot's page also hangs the list in its
// own column.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { ListClock, Scissors, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  formatThreadChapterRange,
  THREAD_CHAPTER_QUERY,
  type ThreadChapter,
  useCompactThreadMutation,
  useThreadChaptersQuery,
} from "./thread-chapters-api.js";

function useChapterRangeLabel(timeZone: string | undefined) {
  const { i18n, t } = useTranslation("ai-ui");
  return (chapter: ThreadChapter) =>
    formatThreadChapterRange(chapter, {
      locale: i18n.language || "en",
      timeZone: timeZone ?? "UTC",
      weekOf: (date) => t("river.weekOf", { date }),
    });
}

/** The open chapter in the URL, and the two ways to change it. */
function useOpenChapter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const chapterId = searchParams.get(THREAD_CHAPTER_QUERY)?.trim() || null;
  const open = useCallback(
    (id: string) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set(THREAD_CHAPTER_QUERY, id);
        return next;
      });
    },
    [setSearchParams]
  );
  const close = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(THREAD_CHAPTER_QUERY);
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);
  return { chapterId, close, open };
}

function ChapterSpaces({ chapter }: { chapter: ThreadChapter }) {
  const { t } = useTranslation("ai-ui");
  if (chapter.spaces.length === 0) {
    return (
      <span className="text-muted-foreground">{t("river.everywhere")}</span>
    );
  }
  return (
    <span className="min-w-0 truncate">
      {chapter.spaces.map((space) => space.key ?? space.id).join(" · ")}
    </span>
  );
}

export function ThreadChaptersList({
  onOpen,
  threadId,
}: {
  /** After a chapter is opened — a menu closes itself here. */
  onOpen?: () => void;
  threadId: string | null;
}) {
  const { t } = useTranslation("ai-ui");
  const query = useThreadChaptersQuery(threadId);
  const compact = useCompactThreadMutation(threadId);
  const rangeLabel = useChapterRangeLabel(query.data?.time_zone);
  const { chapterId: openId, open } = useOpenChapter();
  const chapters = query.data?.chapters ?? [];
  const nothingNew =
    compact.isError && /409|nothingToCompact/.test(String(compact.error));

  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid="thread-chapters">
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("river.history")}
        </span>
        <Button
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={!threadId || compact.isPending}
          onClick={() => compact.mutate()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Scissors aria-hidden className="size-3.5" />
          {compact.isPending ? t("river.compacting") : t("river.compactNow")}
        </Button>
      </div>
      {nothingNew ? (
        <p className="px-2 pb-1 text-muted-foreground text-xs">
          {t("river.nothingToCompact")}
        </p>
      ) : null}
      {query.isPending ? null : chapters.length === 0 ? (
        <p className="px-2 py-2 text-muted-foreground text-xs leading-snug">
          {t("river.empty")}
        </p>
      ) : (
        <ul className="flex flex-col">
          {chapters.map((chapter) => {
            const active = chapter.id === openId;
            return (
              <li key={chapter.id}>
                <button
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-[8px] px-2 py-1.5 text-left text-sm transition",
                    active ? "bg-muted" : "hover:bg-muted/60"
                  )}
                  onClick={() => {
                    open(chapter.id);
                    onOpen?.();
                  }}
                  type="button"
                >
                  <span className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span className="shrink-0">{rangeLabel(chapter)}</span>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] uppercase tracking-wide">
                      {t(`river.kind.${chapter.kind}`)}
                    </span>
                  </span>
                  <span className="truncate font-medium leading-snug">
                    {chapter.title}
                  </span>
                  <span className="flex min-w-0 text-muted-foreground text-xs">
                    <ChapterSpaces chapter={chapter} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The list behind one icon — the desk's action row, every desk alike. */
export function ThreadChaptersMenu({ threadId }: { threadId: string | null }) {
  const { t } = useTranslation("ai-ui");
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("river.history")}
          className={cn(
            topbarIconButtonClassName,
            "!size-7 !w-7 !min-w-7 !px-0"
          )}
          size="icon"
          title={t("river.history")}
          type="button"
          variant="ghost"
        >
          <ListClock className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <ThreadChaptersList onOpen={() => setOpen(false)} threadId={threadId} />
      </PopoverContent>
    </Popover>
  );
}

/** One chapter opened: what was discussed, and what to keep in mind. */
export function ThreadChapterCard({ threadId }: { threadId: string | null }) {
  const { t } = useTranslation("ai-ui");
  const query = useThreadChaptersQuery(threadId);
  const rangeLabel = useChapterRangeLabel(query.data?.time_zone);
  const { chapterId, close } = useOpenChapter();
  const chapter = useMemo(
    () => query.data?.chapters.find((row) => row.id === chapterId) ?? null,
    [chapterId, query.data]
  );
  if (!(chapterId && chapter)) {
    return null;
  }
  return (
    <section
      aria-label={chapter.title}
      className="mx-auto mt-3 w-full max-w-3xl shrink-0 rounded-[12px] border border-border-soft bg-card px-4 py-3 shadow-xs"
      data-testid="thread-chapter-card"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span>{rangeLabel(chapter)}</span>
            <span>·</span>
            <ChapterSpaces chapter={chapter} />
          </div>
          <h2 className="mt-0.5 font-semibold text-base leading-snug">
            {chapter.title}
          </h2>
        </div>
        <Button
          aria-label={t("river.backToNow")}
          className="size-7 shrink-0"
          onClick={close}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
        {chapter.summary}
      </p>
      {chapter.keep_in_mind.length > 0 ? (
        <div className="mt-3">
          <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t("river.keepInMind")}
          </h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {chapter.keep_in_mind.map((note, index) => (
              <li className="flex gap-2" key={`${index}-${note.text}`}>
                <span aria-hidden className="text-muted-foreground">
                  •
                </span>
                <span className="min-w-0 flex-1">
                  {note.text}
                  {note.space_key ? (
                    <span className="ml-1.5 text-muted-foreground text-xs">
                      {note.space_key}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
