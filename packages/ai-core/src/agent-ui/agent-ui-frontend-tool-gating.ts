import type { AgentUiContextLike } from "@engenty/ag-ui-bridge";
import {
  type PluginCapabilityRegistry,
  resolvePluginCapability,
} from "@engenty/plugin-sdk";

export function stripModuleOwnedAgentUiFrontendTools(
  agentUi: AgentUiContextLike
): AgentUiContextLike {
  const frontendTools = agentUi.frontend_tools.filter(
    (definition) => !definition.metadata.engenty.owner_module_id?.trim()
  );
  return {
    ...agentUi,
    frontend_tools: frontendTools,
    state_snapshot: agentUi.state_snapshot
      ? {
          ...agentUi.state_snapshot,
          permissions: {
            ...agentUi.state_snapshot.permissions,
            frontend_tools: Object.fromEntries(
              frontendTools.map((tool) => [
                tool.name,
                {
                  available: tool.metadata.engenty.availability === "enabled",
                },
              ])
            ),
          },
        }
      : agentUi.state_snapshot,
  };
}

function ownerModuleId(
  definition: AgentUiContextLike["frontend_tools"][number]
): string {
  return definition.metadata.engenty.owner_module_id?.trim() ?? "";
}

function registeredFrontendToolCapabilities(
  agentUi: AgentUiContextLike,
  moduleId: string
): string[] {
  return agentUi.frontend_tools
    .filter((definition) => ownerModuleId(definition) === moduleId)
    .map((definition) => definition.name);
}

export function filterAgentUiFrontendToolsByTenant(params: {
  agentUi: AgentUiContextLike | undefined;
  registry: PluginCapabilityRegistry;
  tenantId?: string | null;
  tenantPluginOverrides?: Record<string, boolean>;
}): AgentUiContextLike | undefined {
  const { agentUi } = params;
  if (!agentUi) {
    return;
  }

  const frontendTools = agentUi.frontend_tools.filter((definition) => {
    const pluginId = ownerModuleId(definition);
    if (!pluginId) {
      return true;
    }
    const resolution = resolvePluginCapability({
      capability: definition.name,
      contributionKind: "frontend_tool",
      pluginId,
      registeredCapabilities: registeredFrontendToolCapabilities(
        agentUi,
        pluginId
      ),
      registry: params.registry,
      tenantId: params.tenantId ?? undefined,
      tenantPluginOverrides: params.tenantPluginOverrides,
    });
    if (!resolution.allowed) {
      params.registry.diagnostics.push(...resolution.diagnostics);
    }
    return resolution.allowed;
  });

  return {
    ...agentUi,
    frontend_tools: frontendTools,
    // Rebuild the permission map only when there is a snapshot to rebuild —
    // the producer side may legitimately have none (AgentUiContextLike). Same
    // guard as stripModuleOwnedAgentUiFrontendTools above.
    state_snapshot: agentUi.state_snapshot
      ? {
          ...agentUi.state_snapshot,
          permissions: {
            ...agentUi.state_snapshot.permissions,
            frontend_tools: Object.fromEntries(
              frontendTools.map((tool) => [
                tool.name,
                {
                  available: tool.metadata.engenty.availability === "enabled",
                },
              ])
            ),
          },
        }
      : agentUi.state_snapshot,
  };
}
