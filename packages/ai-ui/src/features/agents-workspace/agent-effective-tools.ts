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
