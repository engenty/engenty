import type { AgentUiRunContext } from "@engenty/ag-ui-bridge";
import {
  type PluginCapabilityRegistry,
  resolvePluginCapability,
} from "@engenty/plugin-sdk";

export function stripModuleOwnedAgentUiFrontendTools(
  agentUi: AgentUiRunContext
): AgentUiRunContext {
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
                  requires_confirmation:
                    tool.metadata.engenty.safety === "requires_confirmation",
                },
              ])
            ),
          },
        }
      : agentUi.state_snapshot,
  };
}

function ownerModuleId(
  definition: AgentUiRunContext["frontend_tools"][number]
): string {
  return definition.metadata.engenty.owner_module_id?.trim() ?? "";
}

function registeredFrontendToolCapabilities(
  agentUi: AgentUiRunContext,
  moduleId: string
): string[] {
  return agentUi.frontend_tools
    .filter((definition) => ownerModuleId(definition) === moduleId)
    .map((definition) => definition.name);
}

export function filterAgentUiFrontendToolsByTenant(params: {
  agentUi: AgentUiRunContext | undefined;
  registry: PluginCapabilityRegistry;
  tenantId?: string | null;
  tenantPluginOverrides?: Record<string, boolean>;
}): AgentUiRunContext | undefined {
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
    state_snapshot: {
      ...agentUi.state_snapshot,
      permissions: {
        ...agentUi.state_snapshot.permissions,
        frontend_tools: Object.fromEntries(
          frontendTools.map((tool) => [
            tool.name,
            {
              available: tool.metadata.engenty.availability === "enabled",
              requires_confirmation:
                tool.metadata.engenty.safety === "requires_confirmation",
            },
          ])
        ),
      },
    },
  };
}
