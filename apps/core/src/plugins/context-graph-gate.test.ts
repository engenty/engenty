import type { PluginContextGraphServerApi } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { gateContextGraphApi } from "./context-graph-gate.js";
import type { PluginRecord } from "./registry.js";

// Ways this can fail: an Organisation with the module off still reads or
// writes the graph; one with it on is cut off; an alpha module (opt-in) is
// treated as on without a superadmin turning it on.
function hostApi(): PluginContextGraphServerApi {
  return {
    deleteEdge: vi.fn(async () => {}),
    deleteEntity: vi.fn(async () => {}),
    getEntity: vi.fn(async () => ({ id: "e1" })),
    getOntology: () => ({ edgeTypes: {}, entityTypes: {} }),
    listEdges: vi.fn(async () => [{ id: "x1" }]),
    listEntities: vi.fn(async () => [{ id: "e1" }]),
    upsertEdge: vi.fn(async () => ({ id: "x1" })),
    upsertEntity: vi.fn(async () => ({ id: "e1" })),
  };
}

const alphaModule = {
  id: "context-graph",
  tenantDefault: "opt_in",
} as PluginRecord;

const overrides: Record<string, Record<string, boolean>> = {
  on: { "context-graph": true },
  off: {},
};

function gated() {
  const api = hostApi();
  return {
    api,
    gate: gateContextGraphApi({
      api,
      hostPlugin: alphaModule,
      resolveTenantPluginOverrides: async (tenantId) =>
        overrides[tenantId] ?? {},
    }),
  };
}

describe("gateContextGraphApi", () => {
  it("answers an Organisation without the module like an empty graph and writes nothing", async () => {
    const { api, gate } = gated();
    expect(await gate.listEntities({ tenantId: "off" })).toEqual([]);
    expect(await gate.listEdges({ tenantId: "off" })).toEqual([]);
    expect(await gate.getEntity({ id: "e1", tenantId: "off" })).toBeNull();
    await gate.upsertEntity({ tenantId: "off", type: "person" });
    await gate.deleteEntity({ id: "e1", tenantId: "off" });
    expect(api.upsertEntity).not.toHaveBeenCalled();
    expect(api.deleteEntity).not.toHaveBeenCalled();
  });

  it("passes calls through for an Organisation that has it turned on", async () => {
    const { api, gate } = gated();
    expect(await gate.listEntities({ tenantId: "on" })).toEqual([{ id: "e1" }]);
    await gate.upsertEntity({ tenantId: "on", type: "person" });
    expect(api.upsertEntity).toHaveBeenCalledWith({
      tenantId: "on",
      type: "person",
    });
  });
});
