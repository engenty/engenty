import { currentRequestSpaceId } from "@engenty/api-client";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  type ApprovalDecision,
  decideApprovalRequest,
  fetchUnseenCount,
  type ListNotificationsInput,
  listNotifications,
  markAllSeen,
  markNotification,
} from "./api.js";
import { isNeedsInput } from "./classification.js";

// The space rides every request as a header, so a response is a different
// query per space: the keys carry it, or a space switch would serve the
// previous space's list from cache.
/** How far back the badge looks. Open items that need a person are few; a
 * space with more than this many has a bigger problem than a badge. */
export const NEEDS_INPUT_SCAN_LIMIT = 100;

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (input: ListNotificationsInput, spaceId: string | null) =>
    [...notificationKeys.all, "list", input, spaceId] as const,
  unseenCount: (spaceId: string | null) =>
    [...notificationKeys.all, "unseen-count", spaceId] as const,
};

// In the desktop shell the window is often hidden (tray/dock) while the app
// keeps running — dock badge + native notifications must stay live, so keep
// polling with `document.hidden`. In the browser a hidden tab can idle.
const pollWhileHidden =
  typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;

export function useNotificationsQuery(input?: ListNotificationsInput) {
  const normalized: ListNotificationsInput = { status: "open", ...input };
  const spaceId =
    normalized.scope === "tenant" ? null : currentRequestSpaceId();
  return useQuery({
    queryKey: notificationKeys.list(normalized, spaceId),
    queryFn: ({ signal }) => listNotifications(normalized, signal),
    refetchInterval: 30_000,
    refetchIntervalInBackground: pollWhileHidden,
    staleTime: 10_000,
  });
}

/**
 * Both badge numbers from one poll: `total` for the bell (tenant-wide) and
 * `in_space` for the space card. `total` does not depend on the space, so the
 * previous value stays on screen while a space switch refetches.
 */
export function useUnseenCountQuery() {
  const spaceId = currentRequestSpaceId();
  return useQuery({
    queryKey: notificationKeys.unseenCount(spaceId),
    queryFn: ({ signal }) => fetchUnseenCount(signal),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    refetchIntervalInBackground: pollWhileHidden,
    staleTime: 10_000,
  });
}

/**
 * Open decisions, todos and alerts — Freigaben + Fehler. Updates never
 * count: they are FYI. Not the unseen count: an approval you looked at
 * yesterday and did not answer is still waiting. Shares the inbox list
 * query, so the rail badge and the tab numbers cannot disagree. Space
 * scope is that space's rows only — tenant-wide waits live under Tenant.
 */
export function useNeedsInputCount(scope: "space" | "tenant"): number {
  const query = useNotificationsQuery({
    limit: NEEDS_INPUT_SCAN_LIMIT,
    scope,
    status: "open",
  });
  const spaceId = currentRequestSpaceId();
  const rows = (query.data?.notifications ?? []).filter((n) =>
    scope === "space" ? Boolean(spaceId) && n.space_id === spaceId : true
  );
  return rows.filter(isNeedsInput).length;
}

/** `useNeedsInputCount("space")` — dashboard row and space-home bell. */
export function useSpaceNeedsInputCount(): number {
  return useNeedsInputCount("space");
}

export function useMarkNotificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: "seen" | "dismiss"; id: string }) =>
      markNotification(input.id, input.action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllSeenMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllSeen(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDecideApprovalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { decision: ApprovalDecision; requestId: string }) =>
      decideApprovalRequest(input.requestId, input.decision),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
