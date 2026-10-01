// The chapters of a long conversation, read and cut from the client.
//
// Server: apps/ai `api/thread-chapter-routes.ts`. A chapter is a stretch of
// a conversation that goes on without end — the copilot's river, a
// specialist's desk line, a DM — summarised once: one per day, one per week,
// or on request. Reading the list is what cuts the calendar ones that fell
// due, so the list is current whenever it is on screen.

import { ApiClientResponseError } from "@engenty/api-client";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { requestAiServiceJson } from "../lib/runtime/ai-service-client.js";

export type ThreadChapterKind = "daily" | "manual" | "weekly";

export interface ThreadChapterSpace {
  id: string;
  key: string | null;
  /** Null once the space is gone. */
  name: string | null;
}

export interface ThreadChapter {
  created_at: string;
  id: string;
  kind: ThreadChapterKind;
  message_count: number;
  range_end: string;
  range_start: string;
  spaces: ThreadChapterSpace[];
  summary: string;
  title: string;
}

export interface ThreadChapters {
  chapters: ThreadChapter[];
  /** The zone the calendar chapters were cut in — dates are shown in it. */
  time_zone: string;
}

export const threadChapterKeys = {
  /** The cut in flight — `/chapter` and the list's button share it. */
  cut: (threadId: string) => ["thread", "chapters", "cut", threadId] as const,
  list: (threadId: string) => ["thread", "chapters", threadId] as const,
};

export function useThreadChaptersQuery(threadId: string | null) {
  return useQuery({
    enabled: Boolean(threadId),
    queryFn: ({ signal }) =>
      requestAiServiceJson<ThreadChapters>(
        `/ai/threads/${encodeURIComponent(threadId as string)}/chapters`,
        { signal }
      ),
    queryKey: threadChapterKeys.list(threadId ?? ""),
    staleTime: 60_000,
  });
}

/**
 * A cut is a model call over the whole stretch; the client's default 15s
 * would abort it while the server goes on and keeps the chapter.
 */
const CHAPTER_CUT_TIMEOUT_MS = 120_000;

/** `/chapter`: one chapter over everything since the last one. */
export function useCompactThreadMutation(threadId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: threadChapterKeys.cut(threadId ?? ""),
    mutationFn: () =>
      requestAiServiceJson<{ chapter: ThreadChapter }>(
        `/ai/threads/${encodeURIComponent(threadId as string)}/chapters`,
        {
          method: "POST",
          signal: AbortSignal.timeout(CHAPTER_CUT_TIMEOUT_MS),
        }
      ).then((result) => result.chapter),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: threadChapterKeys.list(threadId ?? ""),
      });
    },
  });
}

/** The cut's 409: nothing said since the last chapter, so none was cut. */
export function isNothingNewToCut(error: unknown): boolean {
  return error instanceof ApiClientResponseError && error.status === 409;
}

/** The newest chapter cut on request — where the transcript starts over. */
export function latestManualChapter(
  chapters: readonly ThreadChapter[]
): ThreadChapter | null {
  let latest: ThreadChapter | null = null;
  for (const chapter of chapters) {
    if (
      chapter.kind === "manual" &&
      (!latest || chapter.range_end > latest.range_end)
    ) {
      latest = chapter;
    }
  }
  return latest;
}

/**
 * The first message said after the chapter was cut; the length when none
 * was yet. A message without a time is one this session just sent — after.
 */
export function chapterBreakIndex(
  messages: readonly { createdAt?: string | null }[],
  rangeEnd: string
): number {
  const end = Date.parse(rangeEnd);
  const index = messages.findIndex((message) => {
    const at = message.createdAt ? Date.parse(message.createdAt) : Number.NaN;
    return Number.isNaN(at) || at >= end;
  });
  return index === -1 ? messages.length : index;
}

/**
 * When a chapter's stretch was, in the person's words: the weekday and day
 * for a day, the Monday for a week, the span for one cut on request. The
 * chapter's title says what happened; this says when.
 */
export function formatThreadChapterRange(
  chapter: Pick<ThreadChapter, "kind" | "range_end" | "range_start">,
  options: {
    locale: string;
    timeZone: string;
    /** "Week of {{date}}" — the caller's translation. */
    weekOf: (date: string) => string;
  }
): string {
  const day = new Intl.DateTimeFormat(options.locale, {
    day: "numeric",
    month: "short",
    timeZone: options.timeZone,
  });
  const weekdayDay = new Intl.DateTimeFormat(options.locale, {
    day: "numeric",
    month: "short",
    timeZone: options.timeZone,
    weekday: "short",
  });
  const start = new Date(chapter.range_start);
  // A range ending at midnight covers the day BEFORE that midnight.
  const last = new Date(new Date(chapter.range_end).getTime() - 1);
  if (chapter.kind === "daily") {
    return weekdayDay.format(last);
  }
  if (chapter.kind === "weekly") {
    return options.weekOf(day.format(start));
  }
  const first = day.format(start);
  const lastLabel = day.format(last);
  return first === lastLabel
    ? weekdayDay.format(last)
    : `${first} – ${lastLabel}`;
}

/** `?chapter=<id>` — a conversation opened at one of its chapters. */
export const THREAD_CHAPTER_QUERY = "chapter";

export function readThreadChapterId(search: string): string | null {
  const value = new URLSearchParams(search).get(THREAD_CHAPTER_QUERY)?.trim();
  return value ? value : null;
}
