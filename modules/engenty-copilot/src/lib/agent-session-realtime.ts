import {
  type PostgresChangeRealtimeChannel,
  type PostgresChangeRealtimeClient,
  subscribePostgresChanges,
} from "@engenty/live-cache";

export type AgentSessionRealtimeChannel = PostgresChangeRealtimeChannel;
export type AgentSessionRealtimeClient = PostgresChangeRealtimeClient;

export interface AgentSessionRealtimePayload {
  eventType?: "INSERT" | "UPDATE" | "DELETE" | string;
  new?: {
    id?: unknown;
  };
  old?: {
    id?: unknown;
  };
}

export interface AgentSessionRealtimeSubscription {
  unsubscribe: () => void;
}

export function createAgentSessionRealtimeSubscription(params: {
  client: AgentSessionRealtimeClient | null;
  onSessionChange: (event: { threadId: string | null }) => void;
  tenantId: string;
  userId: string;
}): AgentSessionRealtimeSubscription | null {
  if (!(params.client && params.tenantId && params.userId)) {
    return null;
  }

  const unsubscribe = subscribePostgresChanges({
    channelName: `copilot-agent-sessions:${params.tenantId}:${params.userId}`,
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
      params.onSessionChange({ threadId });
    },
  });

  return { unsubscribe };
}

function resolveRealtimeSessionId(
  payload: AgentSessionRealtimePayload
): string | null {
  const value = payload.new?.id ?? payload.old?.id;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export { resolveRealtimeSessionId };
