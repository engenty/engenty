/** agentskills.io / Agent Skills: name max length */
export const AGENT_SKILL_NAME_MAX_LENGTH = 64;

/**
 * Regex equivalent to {@link isValidAgentSkillName} (for tests / optional SQL tooling).
 */
export const AGENT_SKILL_NAME_POSTGRES_PATTERN =
  "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$" as const;

/**
 * Agent Skills `name`: lowercase letters, numbers, hyphens only;
 * must not start or end with a hyphen; max 64 characters.
 */
export function isValidAgentSkillName(name: string): boolean {
  if (!name || name.length > AGENT_SKILL_NAME_MAX_LENGTH) {
    return false;
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return false;
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return false;
  }
  return /^[a-z0-9]/.test(name) && /[a-z0-9]$/.test(name);
}

export function assertValidAgentSkillName(name: string): void {
  if (!isValidAgentSkillName(name)) {
    throw new Error(
      `Invalid skill name "${name}": use at most ${AGENT_SKILL_NAME_MAX_LENGTH} characters, lowercase letters, digits, and hyphens only; must not start or end with a hyphen.`
    );
  }
}
