import {
  filterAgentUiFrontendToolsByTenant,
  stripModuleOwnedAgentUiFrontendTools,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import type { AgentUiProducerContext } from "../sessions/types.js";
import {
  buildPluginCapabilityRegistryFromCoreList,
  tenantPluginOverridesFromCoreList,
} from "./core-plugin-registry.js";

const logger = createLogger({ name: "ai.frontend-tool-gating" });

export async function filterAgentUiFrontendToolsForScope(params: {
  agentUi: AgentUiProducerContext | null | undefined;
  tenantId: string;
  accessToken: string | undefined;
}): Promise<AgentUiProducerContext | null> {
  if (!params.agentUi) {
    return null;
  }
  const token = params.accessToken?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(token && coreBaseUrl)) {
    logger.warn("frontend_tool_gating_unavailable_strip_module_tools", {
      hasCoreBaseUrl: Boolean(coreBaseUrl),
      hasToken: Boolean(token),
      tenantId: params.tenantId,
    });
    return stripModuleOwnedAgentUiFrontendTools(params.agentUi);
  }

  try {
    const client = new EngentyCoreClient({
      coreBaseUrl,
      accessToken: token,
    });
    const plugins = await client.listPlugins(params.tenantId);
    const registry = buildPluginCapabilityRegistryFromCoreList(plugins);
    const filtered = filterAgentUiFrontendToolsByTenant({
      agentUi: params.agentUi,
      registry,
      tenantId: params.tenantId,
      tenantPluginOverrides: tenantPluginOverridesFromCoreList(plugins),
    });
    if (registry.diagnostics.length > 0) {
      logger.info("frontend_tool_gating_diagnostics", {
        codes: registry.diagnostics.map((entry) => entry.code),
        tenantId: params.tenantId,
      });
    }
    return filtered ?? null;
  } catch (error) {
    logger.warn("frontend_tool_gating_failed_strip_module_tools", {
      error: error instanceof Error ? error.message : String(error),
      tenantId: params.tenantId,
    });
    return stripModuleOwnedAgentUiFrontendTools(params.agentUi);
  }
}
