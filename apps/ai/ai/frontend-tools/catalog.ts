import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { getCopilotBaseFrontendTools } from "@engenty/engenty-copilot/ai/frontend-tools";

/**
 * Server-side catalog for `@engenty/ai`, merged with AG-UI run `tools` carrying
 * `metadata.engenty`. The merged list is registered per run as native frontend
 * tools (see native-frontend-tool.ts) and named in the run instructions.
 */
export function getServerFrontendToolCatalog(): FrontendToolDefinition[] {
  return getCopilotBaseFrontendTools();
}

export function mergeFrontendToolDefinitions(
  clientTools: FrontendToolDefinition[] | undefined,
  options?: { includeServerTools?: boolean }
): FrontendToolDefinition[] {
  const byName = new Map<string, FrontendToolDefinition>();
  if (options?.includeServerTools !== false) {
    for (const def of getServerFrontendToolCatalog()) {
      byName.set(def.name, def);
    }
  }
  for (const def of clientTools ?? []) {
    byName.set(def.name, def);
  }
  return [...byName.values()];
}
