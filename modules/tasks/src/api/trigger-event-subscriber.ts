// Module-event ingestion edge for event triggers.
//
// Subscribes to the in-process plugin event bus (`engenty.events.modules`) for
// every canonical event name (`<module>.<entity>.<verb>`) that an enabled
// `provider_id = 'module-events'` trigger listens to, and fires matching
// triggers through the shared `fireTrigger` path. The bus only supports
// exact-name subscriptions, so the listened set is replayed from the database
// on boot and extended when a trigger gains a new resource.
//
// (Deliberately NOT a Mastra SignalProvider: those are thread-scoped — every
// subscription targets a (resourceId, threadId) and delivery is a signal into
// that thread. A trigger has no thread; its effect is materializing a Task.)
import type {
  PluginEventPayload,
  PluginEventsApi,
  QueueServiceLike,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listDistinctEventResources,
  listEventTriggersForEvent,
} from "../dal/triggers.js";
import { fireTrigger } from "./trigger-fire.js";

const logger = createLogger({ name: "tasks-trigger-events" });

export const MODULE_EVENTS_PROVIDER_ID = "module-events";

/** Shallow filter match: every filter key must strictly equal the payload's
 * top-level value (numbers/strings/booleans; objects compare by JSON). */
export function eventFilterMatches(
  filter: Record<string, unknown> | null,
  payload: Record<string, unknown>
): boolean {
  if (!filter) {
    return true;
  }
  return Object.entries(filter).every(([key, expected]) => {
    const actual = payload[key];
    if (
      expected !== null &&
      typeof expected === "object" &&
      actual !== null &&
      typeof actual === "object"
    ) {
      try {
        return JSON.stringify(actual) === JSON.stringify(expected);
      } catch {
        return false;
      }
    }
    return actual === expected;
  });
}

export interface TriggerEventSubscriber {
  /** Subscribe the bus listener for a resource (idempotent). Called for each
   * boot-replayed resource and whenever a trigger gains a new one. */
  ensureSubscribed: (resource: string) => void;
  /** Replay the listened-resource set from the database (called on boot). */
  replayFromDatabase: () => Promise<void>;
}

export function createTriggerEventSubscriber(options: {
  events: PluginEventsApi;
  queue?: QueueServiceLike | null;
  supabase: SupabaseClient;
}): TriggerEventSubscriber {
  const subscribed = new Set<string>();

  const handleEvent = async (
    resource: string,
    payload: PluginEventPayload
  ): Promise<void> => {
    const record = (payload ?? {}) as Record<string, unknown>;
    const tenantId =
      typeof record.tenant_id === "string" ? record.tenant_id : null;
    if (!tenantId) {
      // Canonical entity events always carry tenant_id; without it there is
      // no tenancy to match triggers against.
      return;
    }
    const triggers = await listEventTriggersForEvent(options.supabase, {
      providerId: MODULE_EVENTS_PROVIDER_ID,
      resource,
      tenantId,
    });
    for (const trigger of triggers) {
      if (!eventFilterMatches(trigger.event_filter, record)) {
        continue;
      }
      try {
        const task = await fireTrigger({
          eventContext: record,
          firedBy: `module event ${resource}`,
          queue: options.queue ?? null,
          supabase: options.supabase,
          trigger,
        });
        logger.info("event trigger fired", {
          resource,
          taskId: task.id,
          triggerId: trigger.id,
        });
      } catch (error) {
        logger.warn("event trigger fire failed", {
          message: error instanceof Error ? error.message : String(error),
          resource,
          triggerId: trigger.id,
        });
      }
    }
  };

  const ensureSubscribed = (resource: string): void => {
    const name = resource.trim();
    if (!name || subscribed.has(name)) {
      return;
    }
    subscribed.add(name);
    options.events.modules.on(name, (payload) => handleEvent(name, payload));
  };

  return {
    ensureSubscribed,
    async replayFromDatabase() {
      const resources = await listDistinctEventResources(options.supabase);
      for (const resource of resources) {
        ensureSubscribed(resource);
      }
      logger.info("event trigger subscriptions replayed", {
        resources: resources.length,
      });
    },
  };
}
