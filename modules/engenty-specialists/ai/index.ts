// Public entry of @engenty/engenty-specialists/ai — what apps/ai reads about
// hired engenties: the Space playbooks (skills), the catalog floor and the
// policy that applies it, and the standing appendix.

/** The module id, and the `source` its seeded skills carry. */
export const ENGENTY_SPECIALISTS_MODULE_ID = "engenty-specialists";

// biome-ignore lint/performance/noBarrelFile: Public package entrypoint.
export {
  AGENT_ENGENTY_KINDS,
  type AgentEngentyKind,
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TEMPLATE_ID,
  FIRST_ENGENTY_TOOL_IDS,
  isAgentEngentyKind,
  LIVE_HIRE_ATTACHED_TOOL_IDS,
  LIVE_HIRE_SKILL_IDS,
  LIVE_HIRE_TOOL_IDS,
  resolveAgentEngenty,
  SPECIALIST_TOOL_GATING,
} from "./floor.js";
export {
  renderSpecialistAppendix,
  SPECIALIST_REPORT_INSTRUCTIONS,
  type SpecialistInstructionsInput,
  specialistInstructionParts,
} from "./instructions/index.js";
export {
  agentCarriesCatalogFloor,
  effectiveToolGating,
  hirePolicyGateReason,
  isLiveHireEligible,
  type LiveHireEligibilityInput,
  preferredSkillIdsForRun,
  withCatalogFloor,
  withLiveHirePresentationTools,
  withLiveHireSkills,
  withTopLevelHireSkills,
  withTopLevelHireTools,
} from "./policy.js";
export { ENGENTY_SPECIALISTS_MANAGED_SKILLS } from "./skills/index.js";
