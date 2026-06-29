export const AGENT_SKILL_NAME_MAX_LENGTH = 64;

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
