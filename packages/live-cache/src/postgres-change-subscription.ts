import type { PostgresChangeSignal, PostgresChangeSpec } from "./types.js";

export interface PostgresChangeRealtimeChannel {
  on: ((
    event: "postgres_changes",
    config: {
      event: PostgresChangeSpec["event"];
      filter?: string;
      schema: string;
      table: string;
    },
    callback: (payload: PostgresChangePayload) => void
  ) => PostgresChangeRealtimeChannel) &
    ((
      event: "system",
      config: Record<string, never>,
      callback: (payload: SystemMessagePayload) => void
    ) => PostgresChangeRealtimeChannel);
  subscribe: (
    callback?: (status: string, error?: Error) => void
  ) => PostgresChangeRealtimeChannel;
  unsubscribe?: () => Promise<unknown> | unknown;
}

/**
 * Server-pushed channel status message. Realtime acknowledges a join and only
 * afterwards reports postgres_changes setup failures here — supabase-js still
 * says SUBSCRIBED, so without watching these the subscription fails silently.
 */
export interface SystemMessagePayload {
  extension?: string;
  message?: unknown;
  status?: string;
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
  channel = channel.on("system", {}, (payload) => {
    if (payload.status === "error") {
      console.warn(
        `[live-cache] realtime postgres_changes setup failed on "${params.channelName}":`,
        payload.message ?? payload
      );
    }
  });
  channel.subscribe((status, error) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn(
        `[live-cache] realtime channel "${params.channelName}" ${status}`,
        error ?? ""
      );
    }
  });

  return () => {
    if (params.client.removeChannel) {
      void params.client.removeChannel(channel);
      return;
    }
    void channel.unsubscribe?.();
  };
}
