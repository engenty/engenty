// Server-side go-live gate for coordinator-created agents.
import {
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TOOL_IDS,
  LIVE_HIRE_ATTACHED_TOOL_IDS,
  LIVE_HIRE_SKILL_IDS,
  LIVE_HIRE_TOOL_IDS,
} from "@engenty/ai-core";

// Axis is the specialist's declared tools/skills + whether this is a NEW
// hire with a known space — not the tenant operation-approval mode (Axis B).
// The floor lists live in ai-core so the hire form can show them; re-exported
// here for the runtime callers that always read them from the policy.
export {
  LIVE_HIRE_ATTACHED_TOOL_IDS,
  LIVE_HIRE_SKILL_IDS,
  LIVE_HIRE_TOOL_IDS,
} from "@engenty/ai-core";

/**
 * The catalog floor every custom specialist keeps, whatever else it declares.
 * Approvals are the boundary, not this list: the catalog reaches only what the
 * Space allows and each gated operation still asks. Naming narrower tools used
 * to REPLACE the floor, which produced agents with no way to execute anything
 * — live on 2026-08-24, an "Inbox Contact Importer" hired with six module
 * operation ids and no `engenty_tool_execute` reported it had no interface.
 */
export function withCatalogFloor(toolIds: readonly string[]): string[] {
  const next = new Set(toolIds.filter((id) => id.trim().length > 0));
  for (const id of LIVE_HIRE_TOOL_IDS) {
    next.add(id);
  }
  return [...next];
}

/**
 * The setup and hiring set of an engenty that reports to nobody in the
 * space it runs in. Applied at assembly like the catalog floor, so a lead
 * hired blank (or promoted by clearing `reports_to`) can grow the team
 * without a re-hire; a report never gets it, whatever its row says.
 */
export function withTopLevelHireTools(toolIds: readonly string[]): string[] {
  const next = new Set(toolIds.filter((id) => id.trim().length > 0));
  for (const id of FIRST_ENGENTY_TOOL_IDS) {
    next.add(id);
  }
  return [...next];
}

export function withTopLevelHireSkills(skillIds: readonly string[]): string[] {
  const next = new Set(skillIds.filter((id) => id.trim().length > 0));
  next.add(FIRST_ENGENTY_SKILL_ID);
  return [...next];
}

export function withLiveHirePresentationTools(
  toolIds: readonly string[]
): string[] {
  const next = new Set(toolIds.filter((id) => id.trim().length > 0));
  for (const id of LIVE_HIRE_ATTACHED_TOOL_IDS) {
    next.add(id);
  }
  return [...next];
}

/**
 * Whether an agent is an Engenty in a Space — the kind the catalog floor,
 * the floor skills and the specialist appendix are for. Every specialist
 * carries them, hired (database) or shipped by a module: the Space contract
 * tells both to use `/data/Files`, artifacts and `message_agent`, and a
 * module's `agent.json` that names only search + execute used to leave its
 * agent without any of those (tasks.assist, knowledge-base.manager). The
 * space's interfaces (copilot, coordinator, remote), delegated sub-agents
 * and chat surfaces keep exactly what they declare.
 */
export function agentCarriesCatalogFloor(config: {
  kind?: string | null;
  source?: string | null;
}): boolean {
  const kind = config.kind ?? "specialist";
  return (
    kind === "specialist" &&
    (config.source === "database" || config.source === "module")
  );
}

/**
 * The skills a run may open, from the row's own list: every specialist gets
 * the live-hire set, a top-level one the chief-of-staff playbook on top;
 * interfaces, delegated agents and builtins keep their list. One function
 * for the prompt hint (assembly) and the workspace's skill filter (session
 * service): the two must never disagree, or a skill the prompt names is a
 * directory the agent cannot list.
 */
export function preferredSkillIdsForRun(
  config: {
    kind?: string | null;
    skillIds?: readonly string[];
    source?: string | null;
  },
  topLevel: boolean
): string[] {
  const own = config.skillIds ?? [];
  if (!agentCarriesCatalogFloor(config)) {
    return [...own];
  }
  return topLevel
    ? withTopLevelHireSkills(withLiveHireSkills(own))
    : withLiveHireSkills(own);
}

export function withLiveHireSkills(skillIds: readonly string[]): string[] {
  const next = new Set(skillIds.filter((id) => id.trim().length > 0));
  for (const id of LIVE_HIRE_SKILL_IDS) {
    next.add(id);
  }
  return [...next];
}

const LIVE_HIRE_TOOL_ID_SET = new Set<string>(LIVE_HIRE_TOOL_IDS);

export interface LiveHireEligibilityInput {
  /** True when an ACTIVE registry row (or a module/builtin agent) already exists. */
  existingActive: boolean;
  skillIds: readonly string[];
  spaceId: string | null | undefined;
  toolIds: readonly string[];
}

export function isLiveHireEligible(input: LiveHireEligibilityInput): boolean {
  if (input.existingActive) {
    return false;
  }
  const spaceId = input.spaceId?.trim();
  if (!spaceId) {
    return false;
  }
  if (input.skillIds.some((id) => id.trim().length > 0)) {
    return false;
  }
  return input.toolIds.every(
    (id) => id.trim().length === 0 || LIVE_HIRE_TOOL_ID_SET.has(id)
  );
}

export function hirePolicyGateReason(input: LiveHireEligibilityInput): string {
  if (input.existingActive) {
    return "revision";
  }
  if (!input.spaceId?.trim()) {
    return "missing_space";
  }
  if (input.skillIds.some((id) => id.trim().length > 0)) {
    return "skills";
  }
  const extra = input.toolIds.filter(
    (id) => id.trim().length > 0 && !LIVE_HIRE_TOOL_ID_SET.has(id)
  );
  if (extra.length > 0) {
    return `tools:${extra.join(",")}`;
  }
  return "allow_listed";
}
