import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";

export function resolveAppsAiFrontendTools(
  shellTools: FrontendToolDefinition[]
): FrontendToolDefinition[] {
  const toolsByName = new Map<string, FrontendToolDefinition>();

  for (const tool of shellTools) {
    toolsByName.set(tool.name, tool);
  }

  return Array.from(toolsByName.values());
}
