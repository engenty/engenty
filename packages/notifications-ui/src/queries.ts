import { currentRequestSpaceId } from "@engenty/api-client";
import {
  keepPollingWhenHidden,
  staggeredRefetchInterval,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { useMemo } from "react";
import {
  type ApprovalDecision,
  decideApprovalRequest,
  fetchAttentionCount,
  type ListNotificationsInput,
  listNotifications,
  markAllSeen,
  markNotification,
  type NotificationDto,
} from "./api.js";
import { groupAttentionByAgent, isAttention } from "./classification.js";

// The space rides every request as a header, so a response is a different
// query per space: the keys carry it, or a space switch would serve the
// previous space's list from cache.
/** How far back the lists look. Open items that need a person are few; a
 * space with more than this many has a bigger problem than a list. */
export const ATTENTION_SCAN_LIMIT = 100;

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (input: ListNotificationsInput, spaceId: string | null) =>
    [...notificationKeys.all, "list", input, spaceId] as const,
  attentionCount: (spaceId: string | null) =>
    [...notificationKeys.all, "attention-count", spaceId] as const,
};

// Realtime on `core.notifications` is the live path (see realtime.ts). This
// interval is a backup in case the channel drops. Hidden browser tabs idle;
// the desktop shell keeps polling so the dock badge stays live.
export const NOTIFICATIONS_BACKUP_POLL_MS = 60_000;

const pollWhileHidden = keepPollingWhenHidden();

const LIST_POLL_MS = staggeredRefetchInterval(
  NOTIFICATIONS_BACKUP_POLL_MS,
  "notifications-list"
);
const ATTENTION_COUNT_POLL_MS = staggeredRefetchInterval(
  NOTIFICATIONS_BACKUP_POLL_MS,
  "notifications-attention"
);

export function useNotificationsQuery(input?: ListNotificationsInput) {
  const normalized: ListNotificationsInput = { status: "open", ...input };
  const spaceId =
    normalized.scope === "tenant" ? null : currentRequestSpaceId();
  return useQuery({
    queryKey: notificationKeys.list(normalized, spaceId),
    queryFn: ({ signal }) => listNotifications(normalized, signal),
    refetchInterval: LIST_POLL_MS,
    refetchIntervalInBackground: pollWhileHidden,
    staleTime: 10_000,
  });
}

/**
 * Both attention numbers from one poll: `total` for the bell (tenant-wide)
 * and `in_space` for the space. `total` does not depend on the space, so the
 * previous value stays on screen while a space switch refetches.
 */
export function useAttentionCountQuery() {
  const spaceId = currentRequestSpaceId();
  return useQuery({
    queryKey: notificationKeys.attentionCount(spaceId),
    queryFn: ({ signal }) => fetchAttentionCount(signal),
    placeholderData: (previous) => previous,
    refetchInterval: ATTENTION_COUNT_POLL_MS,
    refetchIntervalInBackground: pollWhileHidden,
    staleTime: 10_000,
  });
}

/**
 * The badge number: open attention rows (`isAttention`), seen or not. Space
 * scope is that space's rows only — tenant-wide rows live under Tenant.
 */
export function useAttentionCount(scope: "space" | "tenant"): number {
  const { data } = useAttentionCountQuery();
  return (scope === "space" ? data?.in_space : data?.total) ?? 0;
}

export interface SpaceAttention {
  /** Agent id → its open attention rows (`actor_kind` agent). */
  byAgent: Map<string, NotificationDto[]>;
  isPending: boolean;
  /** This space's open attention rows, newest first. */
  items: NotificationDto[];
}

/**
 * The space's Wichtig: open attention rows of the request's space, newest
 * first, plus the same rows per agent. Rides the inbox list query (same key
 * as the bell's space list), so realtime invalidation keeps every reader —
 * the popover, the dashboard block, the per-agent pills — on one list.
 */
export function useSpaceAttention(): SpaceAttention {
  const query = useNotificationsQuery({
    limit: ATTENTION_SCAN_LIMIT,
    scope: "space",
  });
  const spaceId = currentRequestSpaceId();
  const rows = query.data?.notifications;
  return useMemo(() => {
    // The server lists newest first.
    const items = (rows ?? []).filter(
      (n) => Boolean(spaceId) && n.space_id === spaceId && isAttention(n)
    );
    return {
      byAgent: groupAttentionByAgent(items),
      isPending: query.isPending,
      items,
    };
  }, [query.isPending, rows, spaceId]);
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
