// C6 (skills.md §Module-context presentation): compact skill-catalog hint for
// the current module, injected into the copilot's runtime context. Names +
// one-line descriptions only — bodies always load on demand via the `skill`
// workspace tool. Cached per (tenant, module); see module-skill-hint-cache.

import {
  getCachedModuleSkillHint,
  setCachedModuleSkillHint,
} from "./module-skill-hint-cache.js";
import type { SkillSummary } from "./skill-frontmatter.js";
import type { SkillStorage } from "./skill-storage.js";

// Hard caps: list size and total block size (token guard — truncate the list,
// never the format).
const MAX_HINT_SKILLS = 10;
const MAX_HINT_CHARS = 1500;

const HINT_FOOTER =
  "Load one with the skill tool before doing module work; skill_search covers everything else.";

// Custom shadows managed for the same name (mirrors SkillStorage.getSkill).
function dedupeCustomOverManaged(skills: SkillSummary[]): SkillSummary[] {
  const byName = new Map<string, SkillSummary>();
  for (const skill of skills) {
    const existing = byName.get(skill.name);
    if (!existing || (existing.tier === "managed" && skill.tier === "custom")) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderHint(moduleId: string, skills: SkillSummary[]): string {
  let shown = Math.min(skills.length, MAX_HINT_SKILLS);
  const render = (count: number): string => {
    const lines = [`## Skills for the current module (${moduleId})`];
    for (const skill of skills.slice(0, count)) {
      lines.push(`- ${skill.name} — ${skill.description}`);
    }
    const hidden = skills.length - count;
    if (hidden > 0) {
      lines.push(`…and ${hidden} more — use skill_search`);
    }
    lines.push(HINT_FOOTER);
    return lines.join("\n");
  };
  // Char guard: drop trailing list entries until the block fits.
  let block = render(shown);
  while (block.length > MAX_HINT_CHARS && shown > 1) {
    shown -= 1;
    block = render(shown);
  }
  return block;
}

export interface ResolveModuleSkillCatalogHintInput {
  moduleId: string | null | undefined;
  skillStorage: SkillStorage;
  tenantId: string;
}

// Returns the rendered hint block, or null when there is no module context or
// no skill tagged (`engenty_modules`) for that module.
export async function resolveModuleSkillCatalogHint(
  input: ResolveModuleSkillCatalogHintInput
): Promise<string | null> {
  const moduleId = input.moduleId?.trim();
  if (!moduleId) {
    return null;
  }
  const cached = getCachedModuleSkillHint(input.tenantId, moduleId);
  if (cached !== undefined) {
    return cached;
  }
  const tagged = dedupeCustomOverManaged(
    await input.skillStorage.listSkills()
  ).filter((skill) => skill.engenty_modules.includes(moduleId));
  const hint = tagged.length > 0 ? renderHint(moduleId, tagged) : null;
  setCachedModuleSkillHint(input.tenantId, moduleId, hint);
  return hint;
}
