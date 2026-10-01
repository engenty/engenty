"use client";

// Where a conversation starts over: the newest chapter cut on request
// (`/chapter`, or "New chapter" in the history). The transcript folds what
// came before it behind "Show older messages" and draws the chapter's line;
// a cut in flight, or one that did not land, shows there too. A calendar
// chapter (a day, a week) folds nothing — the date lines already mark it.
//
// Only the stream starts over: what the agent is sent stays its memory's to
// decide (observational memory compacts on its own schedule).

import { useMutationState } from "@engenty/query-client";
import { useCallback, useMemo, useState } from "react";
import {
  isNothingNewToCut,
  latestManualChapter,
  type ThreadChapter,
  threadChapterKeys,
  useThreadChaptersQuery,
} from "./thread-chapters-api.js";

export type ChapterCutState = "failed" | "nothingNew" | "pending";

export interface TranscriptChapterBreak {
  /** The newest chapter cut on request; null before the first. */
  chapter: ThreadChapter | null;
  /** The turns before `chapter` are folded away. */
  collapsed: boolean;
  /** The last cut asked for, while it runs or when it did not land. */
  cut: { at: number; state: ChapterCutState } | null;
}

function cutStateOf(
  state: { error: unknown; status: string } | undefined
): ChapterCutState | null {
  if (state?.status === "pending") {
    return "pending";
  }
  if (state?.status === "error") {
    return isNothingNewToCut(state.error) ? "nothingNew" : "failed";
  }
  return null;
}

export function useTranscriptChapterBreak(threadId: string | null): {
  chapterBreak: TranscriptChapterBreak;
  showOlder: () => void;
} {
  const query = useThreadChaptersQuery(threadId);
  const chapter = useMemo(
    () => latestManualChapter(query.data?.chapters ?? []),
    [query.data]
  );
  // Unfolding holds for one chapter; the next cut folds again.
  const [unfoldedId, setUnfoldedId] = useState<string | null>(null);
  const cuts = useMutationState({
    filters: { mutationKey: threadChapterKeys.cut(threadId ?? "") },
    select: (mutation) => mutation.state,
  });
  const last = cuts.at(-1);
  const cutState = cutStateOf(last);
  const cutAt = last?.submittedAt ?? 0;
  const collapsed = chapter !== null && unfoldedId !== chapter.id;
  const chapterBreak = useMemo<TranscriptChapterBreak>(
    () => ({
      chapter,
      collapsed,
      cut: cutState ? { at: cutAt, state: cutState } : null,
    }),
    [chapter, collapsed, cutAt, cutState]
  );
  const chapterId = chapter?.id ?? null;
  const showOlder = useCallback(() => {
    setUnfoldedId(chapterId);
  }, [chapterId]);
  return { chapterBreak, showOlder };
}
