import {
  patchOptimisticItems,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  InboxThreadDetail,
  InboxThreadsListParams,
  InboxThreadsListResult,
} from "../src/schema/types.js";
import type { InboxMessageStatus, InboxSearchResultItem } from "./api.js";
import { setInboxMessageStatus } from "./api.js";
import { inboxKeys } from "./queries.js";

export function patchThreadDetailStatus(
  detail: InboxThreadDetail | null | undefined,
  ids: ReadonlySet<string>,
  status: InboxMessageStatus
): InboxThreadDetail | null | undefined {
  if (!detail) {
    return detail;
  }
  return {
    ...detail,
    messages: detail.messages.map((message) =>
      ids.has(message.id) ? { ...message, status } : message
    ),
  };
}

export function patchThreadListStatus(
  list: InboxThreadsListResult | undefined,
  threadIds: ReadonlySet<string>,
  status: InboxMessageStatus,
  params: InboxThreadsListParams
): InboxThreadsListResult | undefined {
  if (!list) {
    return list;
  }
  const patched = patchOptimisticItems(
    {
      data: list.threads,
      page: Math.floor((params.offset ?? 0) / (params.limit ?? 25)) + 1,
      pageSize: params.limit ?? 25,
      total: list.total,
    },
    threadIds,
    { latest_status: status },
    (thread) => !params.status || thread.latest_status === params.status
  );
  return patched ? { threads: patched.data, total: patched.total } : list;
}

export function useSetMessageStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; status: InboxMessageStatus }) =>
      setInboxMessageStatus(input),
    onMutate: async ({ ids, status }) => {
      const messageIds = new Set(ids);
      const threadIds = new Set<string>();
      await queryClient.cancelQueries({ queryKey: inboxKeys.all });

      for (const [
        key,
        detail,
      ] of queryClient.getQueriesData<InboxThreadDetail | null>({
        queryKey: [...inboxKeys.all, "thread"],
      })) {
        if (detail?.messages.some((message) => messageIds.has(message.id))) {
          threadIds.add(detail.thread.id);
        }
        queryClient.setQueryData(
          key,
          patchThreadDetailStatus(detail, messageIds, status)
        );
      }

      for (const [key, current] of queryClient.getQueriesData<{
        results: InboxSearchResultItem[];
        total: number;
      }>({ queryKey: [...inboxKeys.all, "search"] })) {
        queryClient.setQueryData(key, {
          ...current,
          results:
            current?.results.map((result) =>
              messageIds.has(result.item.message.id)
                ? {
                    ...result,
                    item: {
                      ...result.item,
                      message: { ...result.item.message, status },
                    },
                  }
                : result
            ) ?? [],
        });
      }

      for (const [
        key,
        current,
      ] of queryClient.getQueriesData<InboxThreadsListResult>({
        queryKey: [...inboxKeys.all, "threads"],
      })) {
        const params: InboxThreadsListParams = {
          connection_id: (key[2] as string | null) ?? undefined,
          status: (key[3] as InboxMessageStatus | null) ?? undefined,
          category: (key[4] as string | null) ?? undefined,
          offset: key[5] as number,
          limit: key[6] as number,
        };
        queryClient.setQueryData(
          key,
          patchThreadListStatus(current, threadIds, status, params)
        );
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      toast.error("Could not update the message status. Inbox is refreshing.");
    },
  });
}
