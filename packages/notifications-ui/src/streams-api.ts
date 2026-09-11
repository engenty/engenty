// Streams: named shared queues with routes out to real channels.
import { requestApiJson } from "@engenty/api-client";
import type {
  NotificationPriority,
  NotificationRoute,
  NotificationStream,
} from "@engenty/notifications";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";

export type StreamWithRoutes = NotificationStream & {
  routes: NotificationRoute[];
};

export interface RouteInput {
  channel: string;
  enabled: boolean;
  min_priority: NotificationPriority;
  target: Record<string, unknown>;
}

export const streamKeys = {
  all: ["notification-streams"] as const,
};

export function useStreamsQuery() {
  return useQuery({
    queryKey: streamKeys.all,
    queryFn: ({ signal }) =>
      requestApiJson<{ streams: StreamWithRoutes[] }>(
        "/api/notifications/streams",
        { signal }
      ),
    staleTime: 30_000,
  });
}

export function useCreateStreamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      description?: string | null;
      key: string;
      name: string;
      space_id?: string | null;
    }) =>
      requestApiJson<{ stream: NotificationStream }>(
        "/api/notifications/streams",
        { body: input, method: "POST" }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: streamKeys.all });
    },
  });
}

export function useDeleteStreamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestApiJson<{ ok: true }>(
        `/api/notifications/streams/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: streamKeys.all });
    },
  });
}

export function useReplaceRoutesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; routes: RouteInput[] }) =>
      requestApiJson<{ routes: NotificationRoute[] }>(
        `/api/notifications/streams/${encodeURIComponent(input.id)}/routes`,
        { body: { routes: input.routes }, method: "PUT" }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: streamKeys.all });
    },
  });
}
