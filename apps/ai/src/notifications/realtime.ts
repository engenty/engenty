// Fire-and-forget Supabase Realtime broadcast so connected clients refresh
// their inbox immediately instead of waiting for the next 30s poll. The
// notifications table itself lives outside supabase migrations (Mastra's
// ai.mastra_notifications, no realtime publication), so broadcast — not
// postgres_changes — is the only push channel available.
//
// Best-effort by design: clients keep polling as the fallback, so a missing
// env or an unreachable realtime endpoint must never fail the emitter.
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "inbox-realtime" });

/** Broadcast topic clients subscribe to (see apps/ui DesktopBridge). */
export function inboxBroadcastTopic(tenantId: string): string {
  return `inbox:${tenantId}`;
}

export function broadcastInboxChanged(tenantId: string): void {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!(url && key && tenantId)) {
    return;
  }
  void fetch(`${url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, {
    body: JSON.stringify({
      messages: [
        {
          event: "inbox-changed",
          payload: {},
          topic: inboxBroadcastTopic(tenantId),
        },
      ],
    }),
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    method: "POST",
  }).catch((error) => {
    logger.debug("inbox broadcast failed (clients fall back to polling)", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}
