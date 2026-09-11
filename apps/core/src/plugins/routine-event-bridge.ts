// Carry module events across to the routines that listen for them.
//
// The plugin event bus is in-process: it lives here, where module plugins are
// loaded. Routines live in apps/ai. So an event routine needs one edge between
// the two, and this is it — core subscribes, apps/ai decides which routines
// match and starts their runs.
//
// Deliberately thin. Matching (`event_filter`), input mapping and firing all
// belong to whoever owns routines; duplicating any of that here would give the
// same rule two homes and one of them would drift.
//
// The listened set is read from `ai.routine_triggers` at boot and re-read
// periodically, because the bus only supports exact-name subscriptions — there
// is no wildcard to lean on. Only the trigger's own switch narrows the set
// here; the routine's master switch is enforced where the fire happens.
import type { PluginEventPayload, PluginEventsApi } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const MODULE_EVENTS_PROVIDER_ID = "module-events";
/** Cheap enough to re-read: one indexed query over a small table. */
const RESUBSCRIBE_INTERVAL_MS = 2 * 60 * 1000;

export interface RoutineEventBridgeOptions {
  /** Base URL of apps/ai, e.g. http://127.0.0.1:8788. */
  aiBaseUrl: string;
  events: PluginEventsApi;
  /**
   * Mints a tenant-scoped access token. Core is the ISSUER of the tokens
   * apps/ai verifies, so the bridge signs one directly rather than exchanging
   * a service credential against its own endpoint.
   */
  getServiceToken: (tenantId: string) => Promise<string | null>;
  logger: {
    error: (message: string, meta?: unknown) => void;
    info: (message: string, meta?: unknown) => void;
  };
  /** Service-role handle; the bridge reads across tenants to build the set. */
  serviceDb: SupabaseClient;
}

export interface RoutineEventBridge {
  stop: () => void;
}

/**
 * Subscribe the bus for every event name an enabled routine listens to, and
 * forward matches to apps/ai.
 *
 * Returns a handle that stops the refresh timer. Subscriptions themselves are
 * process-lifetime — the bus has no unsubscribe that survives a reload, and a
 * duplicate subscription is guarded by `subscribed`.
 */
export function startRoutineEventBridge(
  options: RoutineEventBridgeOptions
): RoutineEventBridge {
  const { aiBaseUrl, events, logger, getServiceToken, serviceDb } = options;
  const subscribed = new Set<string>();

  async function forward(
    resource: string,
    tenantId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const token = await getServiceToken(tenantId);
    if (!token) {
      logger.error("routine event not forwarded — no service credential", {
        resource,
        tenantId,
      });
      return;
    }
    const response = await fetch(`${aiBaseUrl}/ai/v1/routines/events`, {
      body: JSON.stringify({ payload, resource }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      logger.error("routine event dispatch failed", {
        resource,
        status: response.status,
        tenantId,
      });
    }
  }

  function ensureSubscribed(resource: string): void {
    if (subscribed.has(resource)) {
      return;
    }
    subscribed.add(resource);
    events.modules.on(
      resource as Parameters<typeof events.modules.on>[0],
      async (event: PluginEventPayload & { tenantId?: string }) => {
        // An event with no tenant cannot be routed to a tenant's routines, and
        // guessing one would fire another tenant's job.
        const tenantId =
          typeof event?.tenantId === "string" ? event.tenantId : null;
        if (!tenantId) {
          return;
        }
        try {
          await forward(
            resource,
            tenantId,
            event as unknown as Record<string, unknown>
          );
        } catch (err) {
          // A failed forward must not propagate into the emitting module's
          // write path — the event already happened.
          logger.error("routine event bridge threw", {
            message: err instanceof Error ? err.message : String(err),
            resource,
          });
        }
      }
    );
  }

  async function refresh(): Promise<void> {
    const { data, error } = await serviceDb
      .schema("ai")
      .from("routine_triggers")
      .select("resource")
      .eq("kind", "event")
      .eq("enabled", true)
      .eq("provider_id", MODULE_EVENTS_PROVIDER_ID)
      .not("resource", "is", null);
    if (error) {
      logger.error("routine event bridge could not list resources", {
        message: error.message,
      });
      return;
    }
    for (const row of (data ?? []) as { resource: string | null }[]) {
      if (row.resource) {
        ensureSubscribed(row.resource);
      }
    }
  }

  void refresh();
  const timer = setInterval(() => void refresh(), RESUBSCRIBE_INTERVAL_MS);
  timer.unref?.();
  logger.info("routine event bridge started", { aiBaseUrl });

  return {
    stop: () => clearInterval(timer),
  };
}
