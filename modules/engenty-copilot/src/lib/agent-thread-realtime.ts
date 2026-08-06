import {
  type PostgresChangeRealtimeChannel,
  type PostgresChangeRealtimeClient,
  subscribePostgresChanges,
} from "@engenty/live-cache";

export type AgentThreadRealtimeChannel = PostgresChangeRealtimeChannel;
export type AgentThreadRealtimeClient = PostgresChangeRealtimeClient;

export interface AgentThreadRealtimePayload {
  eventType?: "INSERT" | "UPDATE" | "DELETE" | string;
  new?: {
    id?: unknown;
  };
  old?: {
    id?: unknown;
  };
}

export interface AgentThreadRealtimeSubscription {
  unsubscribe: () => void;
}

export function createAgentThreadRealtimeSubscription(params: {
  client: AgentThreadRealtimeClient | null;
  onThreadChange: (event: { threadId: string | null }) => void;
  tenantId: string;
  userId: string;
}): AgentThreadRealtimeSubscription | null {
  if (!(params.client && params.tenantId && params.userId)) {
    return null;
  }

  const unsubscribe = subscribePostgresChanges({
    channelName: `copilot-agent-threads:${params.tenantId}:${params.userId}`,
    client: params.client,
    changes: [
      {
        event: "*",
        filter: `tenant_id=eq.${params.tenantId}`,
        schema: "ai",
        table: "thread",
      },
    ],
    onSignal: (signal) => {
      const record = signal.record;
      const value = record?.id;
      const threadId =
        typeof value === "string" && value.trim().length > 0 ? value : null;
      params.onThreadChange({ threadId });
    },
  });

  return { unsubscribe };
}

function resolveRealtimeThreadId(
  payload: AgentThreadRealtimePayload
): string | null {
  const value = payload.new?.id ?? payload.old?.id;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export { resolveRealtimeThreadId };
