import {
  isPluginOnForTenant,
  type PluginContextGraphServerApi,
} from "@engenty/plugin-sdk";
import type { PluginRecord } from "./registry.js";

/**
 * `server.contextGraph` for callers outside the context-graph module: every
 * call first checks that the module is on for the call's Organisation. When
 * it is off, reads return nothing and writes are skipped — the same answer a
 * graph with no entries gives, so callers need no extra branch.
 */
export function gateContextGraphApi(params: {
  api: PluginContextGraphServerApi;
  hostPlugin: PluginRecord;
  resolveTenantPluginOverrides?: (
    tenantId: string
  ) => Promise<Record<string, boolean>>;
}): PluginContextGraphServerApi {
  const { api, hostPlugin, resolveTenantPluginOverrides } = params;
  const isOn = async (tenantId: string) => {
    const overrides = resolveTenantPluginOverrides
      ? await resolveTenantPluginOverrides(tenantId)
      : {};
    return isPluginOnForTenant(
      hostPlugin.tenantDefault,
      overrides[hostPlugin.id]
    );
  };
  return {
    deleteEdge: async (input) => {
      if (await isOn(input.tenantId)) {
        await api.deleteEdge(input);
      }
    },
    deleteEntity: async (input) => {
      if (await isOn(input.tenantId)) {
        await api.deleteEntity(input);
      }
    },
    getEntity: async (input) =>
      (await isOn(input.tenantId)) ? api.getEntity(input) : null,
    getOntology: () => api.getOntology(),
    listEdges: async (input) =>
      (await isOn(input.tenantId)) ? api.listEdges(input) : [],
    listEntities: async (input) =>
      (await isOn(input.tenantId)) ? api.listEntities(input) : [],
    upsertEdge: async (input) =>
      (await isOn(input.tenantId)) ? api.upsertEdge(input) : null,
    upsertEntity: async (input) =>
      (await isOn(input.tenantId)) ? api.upsertEntity(input) : null,
  };
}
