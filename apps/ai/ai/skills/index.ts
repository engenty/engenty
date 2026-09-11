import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_MD = "SKILL.md";

export function resolveRuntimeSkillsDir(importMetaUrl: string): string {
  const here = dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    here,
    join(here, "..", "ai", "skills"),
    join(here, "ai", "skills"),
  ];
  for (const candidate of candidates) {
    if (hasSkillFolders(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Could not find apps/ai/ai/skills directory relative to ${importMetaUrl}`
  );
}

function hasSkillFolders(dir: string): boolean {
  if (!existsSync(dir)) {
    return false;
  }
  return readdirSync(dir, { withFileTypes: true }).some(
    (entry) =>
      entry.isDirectory() && existsSync(join(dir, entry.name, SKILL_MD))
  );
}

/** Platform playbooks owned by the AI runtime (`source: builtin`). */
export function loadRuntimeManagedSkills(
  skillsDir = resolveRuntimeSkillsDir(import.meta.url)
): Record<string, string> {
  const skills: Record<string, string> = {};
  if (!existsSync(skillsDir)) {
    return skills;
  }
  for (const entry of readdirSync(skillsDir, { withFileTypes: true }).toSorted(
    (left, right) => left.name.localeCompare(right.name)
  )) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillMd = join(skillsDir, entry.name, SKILL_MD);
    if (!existsSync(skillMd)) {
      continue;
    }
    skills[entry.name] = readFileSync(skillMd, "utf8");
  }
  return skills;
}

export function runtimeManagedSkillNames(): string[] {
  return Object.keys(loadRuntimeManagedSkills()).sort((a, b) =>
    a.localeCompare(b)
  );
}
