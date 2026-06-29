// Filter state + source derivation for the tools catalog (ui-6 §4).

export type ToolSourceFilter = "all" | "module" | "mcp" | "custom";

export interface RegistryToolEntry {
  description?: string;
  engenty_mcp_app?: string;
  id: string;
  name: string;
  /** Stamped server-side for module/MCP tools; absent on DB custom tools. */
  source?: string;
}

/**
 * Derive a display source label from the raw registry tool entry:
 * - `module:<id>` for module-provided tools (source starts with module name)
 * - `mcp:<app>` when the `engenty_mcp_app` metadata field is present
 * - `custom` for DB-backed custom tools
 */
export function deriveToolSource(tool: RegistryToolEntry): string {
  if (tool.engenty_mcp_app) {
    return `mcp:${tool.engenty_mcp_app}`;
  }
  if (tool.source && tool.source !== "custom" && tool.source !== "database") {
    return `module:${tool.source}`;
  }
  return "custom";
}

export type ToolSourceCategory = "module" | "mcp" | "custom";

export function deriveToolSourceCategory(
  tool: RegistryToolEntry
): ToolSourceCategory {
  const src = deriveToolSource(tool);
  if (src.startsWith("mcp:")) {
    return "mcp";
  }
  if (src.startsWith("module:")) {
    return "module";
  }
  return "custom";
}

export interface ToolsGroup {
  id: ToolSourceCategory;
  label: string;
  tools: RegistryToolEntry[];
}

const TOOL_GROUP_ORDER: ToolSourceCategory[] = ["module", "mcp", "custom"];

/** Group tools by source category (module / mcp / custom), in a stable order. */
export function groupTools(
  tools: RegistryToolEntry[],
  labels: Record<ToolSourceCategory, string>
): ToolsGroup[] {
  const buckets = new Map<ToolSourceCategory, RegistryToolEntry[]>();
  for (const tool of tools) {
    const category = deriveToolSourceCategory(tool);
    const bucket = buckets.get(category);
    if (bucket) {
      bucket.push(tool);
    } else {
      buckets.set(category, [tool]);
    }
  }
  return TOOL_GROUP_ORDER.filter((category) => buckets.has(category)).map(
    (category) => ({
      id: category,
      label: labels[category],
      tools: buckets.get(category) ?? [],
    })
  );
}

export interface ToolsFilterOptions {
  searchQuery: string;
  sourceFilter: ToolSourceFilter;
}

export function filterTools(
  tools: RegistryToolEntry[],
  { searchQuery, sourceFilter }: ToolsFilterOptions
): RegistryToolEntry[] {
  const q = searchQuery.trim().toLowerCase();
  return tools.filter((tool) => {
    if (
      sourceFilter !== "all" &&
      deriveToolSourceCategory(tool) !== sourceFilter
    ) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      tool.id.toLowerCase().includes(q) ||
      tool.name.toLowerCase().includes(q) ||
      (tool.description ?? "").toLowerCase().includes(q)
    );
  });
}
