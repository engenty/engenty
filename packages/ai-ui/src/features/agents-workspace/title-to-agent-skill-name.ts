import {
  AGENT_SKILL_NAME_MAX_LENGTH,
  isValidAgentSkillName,
} from "./agent-skill-name";

/**
 * Derives an Agent Skills `name` (kebab slug) from a human title.
 */
export function titleToAgentSkillName(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, AGENT_SKILL_NAME_MAX_LENGTH);
}

export function isTitleDerivableToValidSkillName(title: string): boolean {
  return isValidAgentSkillName(titleToAgentSkillName(title));
}
