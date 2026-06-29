import type { ToolExecutionContext } from "@mastra/core/tools";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { EngentyPluginListItem } from "../../../src/ai/core-http-client.js";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coreErrorToToolResult } from "./lib/errors.js";
import { normalizeToolContract } from "./lib/format.js";
import type { NormalizedEngentyToolEntry } from "./schema/types.js";

export const ENGENTY_TOOLS_MODULES_TOOL_ID = "engenty_tools_modules";

export const engentyToolsModulesTool = createTool({
  id: ENGENTY_TOOLS_MODULES_TOOL_ID,
  description:
    "List active Engenty modules for the current user/tenant, including valid moduleIds, names, descriptions, base URLs, and tool counts.",
  inputSchema: z.object({}),
  execute: async (_input, context) => listEngentyToolModules(context),
});

export function createEngentyToolsModulesTool() {
  return engentyToolsModulesTool;
}

export async function listEngentyToolModules(
  contextOrClient:
    | ToolExecutionContext
    | ReturnType<typeof getCurrentEngentyToolsClient>
    | undefined
) {
  const client =
    contextOrClient && "ok" in contextOrClient
      ? contextOrClient
      : getCurrentEngentyToolsClient(contextOrClient);
  if (!client.ok) {
    return client;
  }
  try {
    const workspace = await client.client.getWorkspaceContext();
    const [plugins, entries] = await Promise.all([
      client.client.listPlugins(workspace.currentTenant?.id),
      client.client
        .listToolContracts()
        .then((contracts) => contracts.map(normalizeToolContract)),
    ]);
    const statsByModule = summarizeToolsByModule(entries);

    return {
      ok: true,
      catalog_only: true,
      message:
        "Module discovery completed. These are active modules for the current user/tenant.",
      modules: plugins
        .filter(isActiveModule)
        .map((plugin) => {
          const stats = statsByModule.get(plugin.id);
          return {
            baseUrl: `/mdl/${plugin.id}`,
            description: plugin.description,
            moduleId: plugin.id,
            name: plugin.name ?? plugin.id,
            readOnlyToolCount: stats?.readOnlyToolCount ?? 0,
            sampleToolIds: stats?.sampleToolIds ?? [],
            slug: plugin.id,
            toolCount: stats?.toolCount ?? 0,
          };
        })
        .sort((a, b) => a.moduleId.localeCompare(b.moduleId)),
      next: "Use one of these moduleId values exactly with engenty_tools_search, then run the selected tool with engenty_tool_execute.",
    };
  } catch (err) {
    return coreErrorToToolResult(err);
  }
}

function isActiveModule(plugin: EngentyPluginListItem) {
  const isModule =
    plugin.kind === "module" ||
    (plugin.provides ?? []).some(
      (capability) =>
        capability === `module.${plugin.id}` ||
        capability === `ui.route.module.${plugin.id}`
    );
  if (!isModule) {
    return false;
  }
  if (plugin.loaded === false || plugin.enabled === false) {
    return false;
  }
  if (
    plugin.tenantEnabled === false ||
    plugin.effectiveState?.tenantEnabled === false ||
    plugin.effectiveState?.globallyEnabled === false ||
    plugin.effectiveState?.allowed === false
  ) {
    return false;
  }
  return true;
}

function summarizeToolsByModule(entries: NormalizedEngentyToolEntry[]) {
  const modules = new Map<
    string,
    {
      readOnlyToolCount: number;
      sampleToolIds: string[];
      toolCount: number;
    }
  >();

  for (const entry of entries) {
    const moduleId = entry.moduleId ?? "core";
    const current = modules.get(moduleId) ?? {
      readOnlyToolCount: 0,
      sampleToolIds: [],
      toolCount: 0,
    };
    current.toolCount += 1;
    if (entry.execution.readOnly) {
      current.readOnlyToolCount += 1;
    }
    if (current.sampleToolIds.length < 5) {
      current.sampleToolIds.push(entry.id);
    }
    modules.set(moduleId, current);
  }
  return modules;
}
