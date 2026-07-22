import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type { InboxThreadDetail, InboxThreadListItem } from "../api.js";
import {
  buildInboxThreadSnapshot,
  buildInboxThreadsPreview,
} from "../copilot-snapshot.js";

export function useInboxListAgentUiSlice(input: {
  account: string | null;
  lane: string;
  search: string;
  threads: InboxThreadListItem[];
  total: number;
}) {
  const slice = useMemo(() => {
    const laneLabel = input.lane || "all";
    const preview = buildInboxThreadsPreview(input.threads);
    const filters: Record<string, string> = { lane: laneLabel };
    if (input.account) {
      filters.account = input.account;
    }
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: `Inbox — ${laneLabel}`,
          page_description: input.account
            ? `Email inbox list for lane "${laneLabel}" filtered to one account.`
            : `Email inbox list for lane "${laneLabel}".`,
          list_search: input.search,
          list_filters: filters,
          list_total: input.total,
        }),
        ...(preview.length > 0 ? { inbox_threads_preview: preview } : {}),
      },
    };
  }, [input.account, input.lane, input.search, input.threads, input.total]);

  useRegisterAgentUiSlice("inbox_list", slice);
}

export function useInboxThreadAgentUiSlice(input: {
  detail: InboxThreadDetail | null | undefined;
  threadId: string | null;
}) {
  const slice = useMemo(() => {
    if (!(input.threadId && input.detail)) {
      return null;
    }
    const subject =
      input.detail.thread.subject?.trim() || "Email thread";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: subject,
          page_description: `Open email thread with ${input.detail.thread.message_count} message(s).`,
        }),
        inbox_thread_snapshot: buildInboxThreadSnapshot(input.detail),
      },
      selection: {
        entity_id: input.threadId,
        entity_type: "inbox_thread",
      },
    };
  }, [input.detail, input.threadId]);

  useRegisterAgentUiSlice("inbox_thread", slice);
}
