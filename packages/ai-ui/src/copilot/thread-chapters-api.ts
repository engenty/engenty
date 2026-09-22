// The chapters of a long conversation, read and cut from the client.
//
// Server: apps/ai `api/thread-chapter-routes.ts`. A chapter is a stretch of
// a conversation that goes on without end — the copilot's river, a
// specialist's desk line, a DM — summarised once: one per day, one per week,
// or on request. Reading the list is what cuts the calendar ones that fell
// due, so the list is current whenever it is on screen.

import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { requestAiServiceJson } from "../lib/runtime/ai-service-client.js";

export type ThreadChapterKind = "daily" | "manual" | "weekly";

export interface ThreadChapterSpace {
  id: string;
  key: string | null;
}

export interface ThreadChapterNote {
  space_key: string | null;
  text: string;
}

export interface ThreadChapter {
  created_at: string;
  id: string;
  keep_in_mind: ThreadChapterNote[];
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

/** "Compact now": one chapter over everything since the last one. */
export function useCompactThreadMutation(threadId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requestAiServiceJson<{ chapter: ThreadChapter }>(
        `/ai/threads/${encodeURIComponent(threadId as string)}/chapters`,
        { method: "POST" }
      ).then((result) => result.chapter),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: threadChapterKeys.list(threadId ?? ""),
      });
    },
  });
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
