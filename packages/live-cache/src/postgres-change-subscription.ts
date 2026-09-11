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

/**
 * Every subscription gets its own channel topic.
 *
 * `client.channel(topic)` RETURNS THE EXISTING channel when one with that
 * topic is still registered on the socket, and `.on("postgres_changes", …)`
 * THROWS on a channel that has already joined ("cannot add `postgres_changes`
 * callbacks … after `subscribe()`"). Two subscribers of the same logical
 * stream — a remount racing its own async `removeChannel`, or two components
 * watching one thread — would adopt that joined channel and throw out of the
 * effect, taking the component tree down with them. A per-subscription suffix
 * makes the adoption impossible; the caller's name stays the readable prefix.
 */
let channelSequence = 0;

export function subscribePostgresChanges(params: {
  changes: PostgresChangeSpec[];
  client: PostgresChangeRealtimeClient;
  channelName: string;
  onSignal: (signal: PostgresChangeSignal) => void;
}) {
  if (params.changes.length === 0) {
    return () => undefined;
  }

  channelSequence += 1;
  let channel = params.client.channel(
    `${params.channelName}#${channelSequence}`
  );
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
