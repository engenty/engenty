import { resolveToolAdminDescription } from "./tool-admin-descriptions";

export interface EffectiveToolRow {
  description: string;
  skillNames: string[];
  tool: string;
}

/**
 * Union of `allowed_tools` across effective skills, merged with optional
 * `agentToolIds` from runtime `build_tools` so admin matches orchestrator surface.
 */
export function buildEffectiveToolRows(
  effectiveSkills: { allowed_tools: string[]; name: string }[],
  agentToolIds?: string[] | null
): EffectiveToolRow[] {
  const byTool = new Map<string, Set<string>>();
  for (const skill of effectiveSkills) {
    for (const tool of skill.allowed_tools) {
      let skillsForTool = byTool.get(tool);
      if (!skillsForTool) {
        skillsForTool = new Set();
        byTool.set(tool, skillsForTool);
      }
      skillsForTool.add(skill.name);
    }
  }
  if (agentToolIds) {
    for (const tool of agentToolIds) {
      if (!byTool.has(tool)) {
        byTool.set(tool, new Set());
      }
    }
  }
  return Array.from(byTool.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tool, skillSet]) => ({
      description: resolveToolAdminDescription(tool),
      tool,
      skillNames: Array.from(skillSet).sort((x, y) => x.localeCompare(y)),
    }));
}

export type EffectiveToolLayer =
  | "default"
  | "agent"
  | "attached"
  | "spaceHidden";

export interface EffectiveToolLayerGroup {
  layer: EffectiveToolLayer;
  rows: EffectiveToolRow[];
}

/** The tool ids the runtime lays out by layer (effective-capabilities). */
export interface EffectiveToolLayerIds {
  agent: string[];
  attached: string[];
  default: string[];
  space_hidden: string[] | null;
}

const LAYER_ORDER: readonly EffectiveToolLayer[] = [
  "default",
  "agent",
  "attached",
  "spaceHidden",
];

/**
 * The rows the tab lists, grouped the way the run sees them. Without the
 * layer answer (older server, request failed) every row is "agent", which
 * is the list the tab always showed.
 */
export function groupEffectiveToolRows(
  rows: readonly EffectiveToolRow[],
  layers: EffectiveToolLayerIds | null | undefined
): EffectiveToolLayerGroup[] {
  if (!layers) {
    return rows.length > 0 ? [{ layer: "agent", rows: [...rows] }] : [];
  }
  const hidden = new Set(layers.space_hidden ?? []);
  const floor = new Set(layers.default);
  const attached = new Set(layers.attached);
  const byTool = new Map(rows.map((row) => [row.tool, row] as const));
  // Floor and attached tools are not on the row, so the skill union never
  // lists them — add them, described from the admin catalog.
  for (const id of [...layers.default, ...layers.attached]) {
    if (!byTool.has(id)) {
      const [row] = buildEffectiveToolRows([], [id]);
      if (row) {
        byTool.set(id, row);
      }
    }
  }
  const layerOf = (tool: string): EffectiveToolLayer => {
    if (hidden.has(tool)) {
      return "spaceHidden";
    }
    if (floor.has(tool)) {
      return "default";
    }
    return attached.has(tool) ? "attached" : "agent";
  };
  const groups = new Map<EffectiveToolLayer, EffectiveToolRow[]>();
  for (const row of [...byTool.values()].sort((a, b) =>
    a.tool.localeCompare(b.tool)
  )) {
    const layer = layerOf(row.tool);
    groups.set(layer, [...(groups.get(layer) ?? []), row]);
  }
  return LAYER_ORDER.filter((layer) => groups.has(layer)).map((layer) => ({
    layer,
    rows: groups.get(layer) ?? [],
  }));
}
