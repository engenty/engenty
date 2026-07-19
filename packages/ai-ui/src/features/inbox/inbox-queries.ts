import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  fetchInboxUnseenCount,
  listInbox,
  markAllInboxSeen,
  markInboxNotification,
} from "./inbox-api.js";

export const inboxKeys = {
  all: ["inbox"] as const,
  list: (status: "open" | "all") => [...inboxKeys.all, "list", status] as const,
  unseenCount: () => [...inboxKeys.all, "unseen-count"] as const,
};

// In the desktop shell the window is often hidden (tray/dock) while the app
// keeps running — dock badge + native notifications must stay live, so keep
// polling with `document.hidden`. In the browser a hidden tab can idle.
const pollWhileHidden =
  typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;

export function useInboxListQuery(input?: {
  limit?: number;
  status?: "open" | "all";
}) {
  const status = input?.status ?? "open";
  return useQuery({
    queryKey: inboxKeys.list(status),
    queryFn: ({ signal }) =>
      listInbox(
        { status, ...(input?.limit ? { limit: input.limit } : {}) },
        signal
      ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: pollWhileHidden,
    staleTime: 10_000,
  });
}

/** Badge count — polled so the app-bar/sidebar badges stay live app-wide. */
export function useInboxUnseenCountQuery() {
  return useQuery({
    queryKey: inboxKeys.unseenCount(),
    queryFn: ({ signal }) => fetchInboxUnseenCount(signal),
    refetchInterval: 30_000,
    refetchIntervalInBackground: pollWhileHidden,
    staleTime: 10_000,
  });
}

export function useMarkInboxNotificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: "seen" | "dismiss"; id: string }) =>
      markInboxNotification(input.id, input.action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

export function useMarkAllInboxSeenMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllInboxSeen(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}
