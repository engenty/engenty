// Wires `ContextGraphEventBinding[]` to `engenty.events.modules.on(...)`.
// `upsert`: load() → upsertEntity → for each declared edge resolve `other`
// by external ref and upsertEdge. `delete`: externalRef() → deleteEntity
// (edges cascade). `tenantScoped` defaults to true → silent no-op when
// `ctx.tenantId` is missing (mirrors `SearchIndexProvider.onEvents`).

import type {
  ContextGraphEventBinding,
  ContextGraphUpsertInput,
  PluginEventPayload,
  PluginEventRegistrationReceipt,
  PluginEventsApi,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { ContextGraphServerApi } from "./server-api.js";

const logger = createLogger({ name: "context-graph:event-binding" });

export interface AttachContextGraphEventBindingsInput {
  bindings: ContextGraphEventBinding[];
  contextGraph: ContextGraphServerApi;
  events: PluginEventsApi;
}

export function attachContextGraphEventBindings(
  input: AttachContextGraphEventBindingsInput
): PluginEventRegistrationReceipt[] {
  const { events, bindings, contextGraph } = input;
  return bindings.map((binding) =>
    events.modules.on(binding.name, buildHandler(binding, contextGraph), {
      tenantScoped: binding.tenantScoped ?? true,
    })
  );
}

function buildHandler(
  binding: ContextGraphEventBinding,
  api: ContextGraphServerApi
) {
  return async (payload: PluginEventPayload, ctx: { tenantId?: string }) => {
    const tenantId = resolveTenantId(payload, ctx);
    if (!tenantId) {
      return;
    }
    try {
      if (binding.action === "delete") {
        const ref = binding.externalRef?.(payload);
        if (ref) {
          await api.deleteEntity({ tenantId, externalRef: ref });
        }
        return;
      }
      const upsert = await binding.load?.(payload);
      if (upsert) {
        await applyUpsert(api, tenantId, upsert);
      }
    } catch (error) {
      logger.warn("context-graph event binding failed", {
        eventName: binding.name,
        action: binding.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

async function applyUpsert(
  api: ContextGraphServerApi,
  tenantId: string,
  upsert: ContextGraphUpsertInput
): Promise<void> {
  const entity = await api.upsertEntity({ tenantId, ...upsert.entity });
  for (const edge of upsert.edges ?? []) {
    const other = await api.getEntity({ tenantId, externalRef: edge.other });
    if (!other) {
      logger.debug("context-graph edge endpoint not found", {
        edgeType: edge.type,
        other: edge.other,
      });
      continue;
    }
    const [subjectId, objectId] =
      edge.direction === "out" ? [entity.id, other.id] : [other.id, entity.id];
    await api.upsertEdge({
      tenantId,
      type: edge.type,
      subjectId,
      objectId,
      attributes: edge.attributes,
    });
  }
}

function resolveTenantId(
  payload: PluginEventPayload,
  ctx: { tenantId?: string }
): string | undefined {
  if (ctx?.tenantId) {
    return ctx.tenantId;
  }
  for (const c of [
    (payload as { tenant_id?: unknown }).tenant_id,
    (payload as { tenantId?: unknown }).tenantId,
  ]) {
    if (typeof c === "string" && c.trim()) {
      return c.trim();
    }
  }
  return;
}

// Re-export for tests/consumers.
export type {
  ContextGraphEventBinding,
  ExternalRef,
} from "@engenty/plugin-sdk";
