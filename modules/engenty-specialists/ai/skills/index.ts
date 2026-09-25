import chiefOfStaffSkill from "./chief-of-staff/SKILL.md";
import durableWorkSkill from "./durable-work/SKILL.md";
import gettingStartedSkill from "./getting-started/SKILL.md";
import hireAgentSkill from "./hire-agent/SKILL.md";
import routinesSkill from "./routines/SKILL.md";
import spaceDataSkill from "./space-data/SKILL.md";
import spaceSetupSkill from "./space-setup/SKILL.md";
import workRoutingSkill from "./work-routing/SKILL.md";

// The Space playbooks the copilot and hired engenties share. Seeded by NAME
// into every tenant's managed catalog (source `engenty-specialists`) — never
// through the module capability channel, which `allowed-skills.ts` filters by
// mount: a floor skill must exist in every Space. A run sees one when its
// agent prefers it (`skillIds`, the live-hire floor, chief-of-staff for a
// coordinator) or the Space mounts it.
export const ENGENTY_SPECIALISTS_MANAGED_SKILLS: Record<string, string> = {
  "chief-of-staff": chiefOfStaffSkill,
  "durable-work": durableWorkSkill,
  "getting-started": gettingStartedSkill,
  "hire-agent": hireAgentSkill,
  routines: routinesSkill,
  "space-data": spaceDataSkill,
  "space-setup": spaceSetupSkill,
  "work-routing": workRoutingSkill,
};
