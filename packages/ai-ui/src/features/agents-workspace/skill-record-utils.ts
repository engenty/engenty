import type {
  AiSkillCatalogEntry,
  AiSkillRecord,
} from "../../lib/admin/ai-runtime-api";

export function getSkillModuleId(
  skill: Pick<AiSkillRecord, "metadata">
): string {
  return skill.metadata.module_id ?? "engenty-core";
}

export function getSkillCatalogModuleId(
  skill: Pick<AiSkillCatalogEntry, "metadata" | "origins">
): string {
  return (
    skill.metadata.module_id ?? skill.origins[0]?.module_id ?? "engenty-core"
  );
}

/** Display source like skills.sh: `engenty/core` or `engenty/<module>`. */
export function formatEngentySkillSource(moduleId: string): string {
  const id = moduleId.trim() || "engenty-core";
  if (id === "engenty-core") {
    return "engenty/core";
  }
  return `engenty/${id}`;
}

/**
 * Repo-relative path for a skill file (matches `modules/.../ai/skills` and ai-core seed layout).
 */
export function buildSkillRepoRelativePath(args: {
  logicalPath: string;
  moduleId: string;
  skillName: string;
}): string {
  const mod = args.moduleId.trim() || "engenty-core";
  const name = args.skillName.trim();
  const file = args.logicalPath.trim() || "SKILL.md";
  if (mod === "engenty-core") {
    return `packages/ai-core/src/skills/seed/${name}/${file}`;
  }
  return `modules/${mod}/ai/skills/${name}/${file}`;
}
