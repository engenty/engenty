import type { PostgresChangeSignal, PostgresChangeSpec } from "./types.js";

export interface PostgresChangeRealtimeChannel {
  on: (
    event: "postgres_changes",
    config: {
      event: PostgresChangeSpec["event"];
      filter?: string;
      schema: string;
      table: string;
    },
    callback: (payload: PostgresChangePayload) => void
  ) => PostgresChangeRealtimeChannel;
  subscribe: () => PostgresChangeRealtimeChannel;
  unsubscribe?: () => Promise<unknown> | unknown;
}

export interface PostgresChangeRealtimeClient {
  channel: (topic: string) => PostgresChangeRealtimeChannel;
  removeChannel?: (
    channel: PostgresChangeRealtimeChannel
  ) => Promise<unknown> | unknown;
}

export interface PostgresChangePayload {
  eventType?: "INSERT" | "UPDATE" | "DELETE" | string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
  schema?: string;
  table?: string;
}

function readStringColumn(
  payload: PostgresChangePayload,
  column: string
): string | null {
  const record = payload.new ?? payload.old;
  const value = record?.[column];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function readTenantIdFromPayload(
  payload: PostgresChangePayload
): string | null {
  return readStringColumn(payload, "tenant_id");
}

export function readUserIdFromPayload(
  payload: PostgresChangePayload
): string | null {
  return readStringColumn(payload, "user_id");
}

export function toPostgresChangeSignal(
  change: PostgresChangeSpec,
  payload: PostgresChangePayload
): PostgresChangeSignal {
  return {
    kind: "postgres_changes",
    schema: change.schema,
    table: change.table,
    eventType: payload.eventType,
    tenantId: readTenantIdFromPayload(payload),
    userId: readUserIdFromPayload(payload),
    record: payload.new ?? payload.old,
  };
}

export function subscribePostgresChanges(params: {
  changes: PostgresChangeSpec[];
  client: PostgresChangeRealtimeClient;
  channelName: string;
  onSignal: (signal: PostgresChangeSignal) => void;
}) {
  if (params.changes.length === 0) {
    return () => undefined;
  }

  let channel = params.client.channel(params.channelName);
  for (const change of params.changes) {
    channel = channel.on(
      "postgres_changes",
      {
        event: change.event ?? "*",
        schema: change.schema,
        table: change.table,
        ...(change.filter ? { filter: change.filter } : {}),
      },
      (payload) => {
        params.onSignal(toPostgresChangeSignal(change, payload));
      }
    );
  }
  channel.subscribe();

  return () => {
    if (params.client.removeChannel) {
      void params.client.removeChannel(channel);
      return;
    }
    void channel.unsubscribe?.();
  };
}
