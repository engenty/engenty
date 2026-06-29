// Read-only listing of module-provided tools for GET /ai/registry/tools.
// Module tools reach apps/ai via the module capability channel; this maps
// them to plain catalog entries (`source` = owning module id). Best-effort:
// when the capability channel is unavailable, the catalog falls back to
// database (custom) tools only.

import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";

export interface ModuleToolListEntry {
  description?: string;
  id: string;
  name: string;
  /** Owning module id — UI renders this as `module:<id>`. */
  source: string;
}

export async function listModuleTools(
  moduleLoader: DynamicAiModuleCapabilityLoader | undefined,
  log: (message: string, err: unknown) => void = () => undefined
): Promise<ModuleToolListEntry[]> {
  if (!moduleLoader) {
    return [];
  }
  try {
    const capabilities = await moduleLoader.listModuleCapabilities();
    const entries: ModuleToolListEntry[] = [];
    for (const capability of capabilities) {
      for (const [toolId, tool] of Object.entries(capability.tools ?? {})) {
        // MastraToolDefinition is opaque (`object`); description is optional.
        const description = (tool as { description?: unknown })?.description;
        entries.push({
          ...(typeof description === "string" && description
            ? { description }
            : {}),
          id: toolId,
          name: toolId,
          source: capability.moduleId,
        });
      }
    }
    return entries.toSorted((a, b) => a.id.localeCompare(b.id));
  } catch (err) {
    log("failed to list module tools for the registry catalog", err);
    return [];
  }
}
