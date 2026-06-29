// Plugin host bridge for `engenty.server.registerContextGraphSchema(...)`.
// Merges the SDK registration into the shared `OntologyRegistry` and
// subscribes any declarative `onEvents` bindings. Lives here (not in core)
// so non-core hosts can wire the same surface.

import type {
  ContextGraphSchemaRegistration,
  PluginEventsApi,
  PluginRegistrationReceipt,
} from "@engenty/plugin-sdk";
import { attachContextGraphEventBindings } from "./event-binding.js";
import type { OntologyRegistry } from "./registry.js";
import type { ContextGraphServerApi } from "./server-api.js";

export interface CreateContextGraphHostInput {
  // Per-plugin events; used to subscribe optional declarative `onEvents`.
  events: PluginEventsApi;
  // Owning module id for the receipt's sourceInfo.
  moduleId?: string;
  registry: OntologyRegistry;
  // Server API singleton — when missing (DB-less boot), `onEvents` no-op.
  serverApi?: ContextGraphServerApi;
}

export type RegisterContextGraphSchema = (
  input: ContextGraphSchemaRegistration
) => PluginRegistrationReceipt | undefined;

export function createContextGraphHost(
  input: CreateContextGraphHostInput
): RegisterContextGraphSchema {
  const { events, registry, serverApi } = input;
  return function registerContextGraphSchema(registration) {
    if (!registration?.moduleId?.trim()) {
      return;
    }
    registry.registerSchema(registration);

    const eventReceipts =
      serverApi && registration.onEvents?.length
        ? attachContextGraphEventBindings({
            events,
            bindings: registration.onEvents,
            contextGraph: serverApi,
          })
        : [];

    const dispose = async () => {
      for (const receipt of eventReceipts) {
        try {
          await receipt.dispose();
        } catch {}
      }
    };

    return {
      dispose,
      id: `context-graph-schema:${registration.moduleId}`,
      kind: "server.contextGraphSchema",
      pluginId: registration.moduleId,
      sourceInfo: {
        manifestId: registration.moduleId,
        manifestPath: registration.moduleId,
        pluginId: registration.moduleId,
        registrationKind: "server.contextGraphSchema",
        rootDir: "",
        source: "context-graph-schema",
        sourceType: "module",
      },
    };
  };
}
