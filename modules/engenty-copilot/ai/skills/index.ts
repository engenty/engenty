import durableWorkSkill from "./durable-work/SKILL.md";
import hireAgentSkill from "./hire-agent/SKILL.md";
import spaceDataSkill from "./space-data/SKILL.md";
import spaceSetupSkill from "./space-setup/SKILL.md";
import workRoutingSkill from "./work-routing/SKILL.md";

// Copilot product playbooks. Seeded as source `engenty-copilot` — not platform
// skills. Visible when preferred on the copilot (skillIds) or explicitly mounted.
export const ENGENTY_COPILOT_MANAGED_SKILLS: Record<string, string> = {
  "durable-work": durableWorkSkill,
  "hire-agent": hireAgentSkill,
  "space-data": spaceDataSkill,
  "space-setup": spaceSetupSkill,
  "work-routing": workRoutingSkill,
};
