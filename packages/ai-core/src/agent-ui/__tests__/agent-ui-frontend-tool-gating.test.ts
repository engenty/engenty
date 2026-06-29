import {
  type AgentUiRunContext,
  createFrontendToolDefinition,
} from "@engenty/ag-ui-bridge";
import type { PluginCapabilityRegistry } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { filterAgentUiFrontendToolsByTenant } from "../agent-ui-frontend-tool-gating.js";

function createRegistry(): PluginCapabilityRegistry {
  return {
    diagnostics: [],
    plugins: [
      {
        id: "contacts",
        loaded: true,
        enabled: true,
        requires: [],
        provides: ["module.contacts"],
      },
      {
        id: "leads",
        loaded: true,
        enabled: true,
        requires: [],
        provides: ["module.leads"],
      },
    ],
  };
}

function createAgentUi(): AgentUiRunContext {
  return {
    frontend_tools: [
      createFrontendToolDefinition({
        availability: "enabled",
        description: "Open the copilot.",
        parameters: { type: "object" },
        name: "openCopilot",
        safety: "safe",
      }),
      createFrontendToolDefinition({
        availability: "enabled",
        description: "Patch the contact draft.",
        parameters: { type: "object" },
        name: "contacts_apply_draft_patch",
        owner_module_id: "contacts",
        safety: "requires_confirmation",
      }),
      createFrontendToolDefinition({
        availability: "enabled",
        description: "Patch the lead draft.",
        parameters: { type: "object" },
        name: "leads.applyDraftPatch",
        owner_module_id: "leads",
        safety: "requires_confirmation",
      }),
    ],
    state_snapshot: {
      observed_at: "2026-05-15T00:00:00.000Z",
      permissions: {
        frontend_tools: {},
      },
      route: {
        module_id: "contacts",
        pathname: "/mdl/contacts/1/edit",
        route_key: "edit",
      },
      sequence: 1,
      shell: {
        copilot_open: true,
      },
      snapshot_id: "snapshot-1",
      version: 1,
    },
  };
}

describe("filterAgentUiFrontendToolsByTenant", () => {
  it("keeps platform tools and filters tenant-disabled module tools", () => {
    const registry = createRegistry();
    const filtered = filterAgentUiFrontendToolsByTenant({
      agentUi: createAgentUi(),
      registry,
      tenantId: "tenant-1",
      tenantPluginOverrides: { contacts: false },
    });

    expect(filtered?.frontend_tools.map((tool) => tool.name)).toEqual([
      "openCopilot",
      "leads.applyDraftPatch",
    ]);
    expect(
      Object.keys(filtered?.state_snapshot.permissions?.frontend_tools ?? {})
    ).toEqual(["openCopilot", "leads.applyDraftPatch"]);
    expect(registry.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "plugin.capability.plugin_tenant_disabled"
    );
  });

  it("filters tools owned by modules with disabled dependencies", () => {
    const registry: PluginCapabilityRegistry = {
      diagnostics: [],
      plugins: [
        {
          id: "contacts",
          loaded: true,
          enabled: true,
          requires: [],
          provides: ["module.contacts"],
        },
        {
          id: "leads",
          loaded: true,
          enabled: true,
          requires: ["contacts"],
          provides: ["module.leads"],
        },
      ],
    };
    const filtered = filterAgentUiFrontendToolsByTenant({
      agentUi: createAgentUi(),
      registry,
      tenantId: "tenant-1",
      tenantPluginOverrides: { contacts: false },
    });

    expect(filtered?.frontend_tools.map((tool) => tool.name)).toEqual([
      "openCopilot",
    ]);
    expect(registry.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "plugin.dependency.disabled_required"
    );
  });
});
