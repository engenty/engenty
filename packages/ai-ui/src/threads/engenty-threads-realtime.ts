import {
  type PostgresChangeRealtimeChannel,
  type PostgresChangeRealtimeClient,
  subscribePostgresChanges,
} from "@engenty/live-cache";

export type EngentyThreadsRealtimeChannel = PostgresChangeRealtimeChannel;
export type EngentyThreadsRealtimeClient = PostgresChangeRealtimeClient;

export interface EngentyThreadsRealtimeSubscription {
  unsubscribe: () => void;
}

export function createEngentyThreadsRealtimeSubscription(params: {
  client: EngentyThreadsRealtimeClient | null;
  onThreadsChange: () => void;
  tenantId: string;
  userId: string;
}): EngentyThreadsRealtimeSubscription | null {
  if (!(params.client && params.tenantId && params.userId)) {
    return null;
  }

  const unsubscribe = subscribePostgresChanges({
    channelName: `engenty-threads:${params.tenantId}:${params.userId}`,
    client: params.client,
    changes: [
      {
        event: "*",
        filter: `tenant_id=eq.${params.tenantId}`,
        schema: "ai",
        table: "thread",
      },
    ],
    onSignal: () => {
      params.onThreadsChange();
    },
  });

  return { unsubscribe };
}
