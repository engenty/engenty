// Server-side go-live gate for coordinator-created agents.
import {
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TOOL_IDS,
} from "@engenty/ai-core";
// Axis is the specialist's declared tools/skills + whether this is a NEW
// hire with a known space — not the tenant operation-approval mode (Axis B).

/**
 * Catalog path, Space Data writers, and the native surface a specialist
 * answers on. Every hired specialist keeps these whatever its row declared —
 * pages go through execute, Ablage/tables/apps through the native write tools.
 * Approvals stay the boundary.
 */
export const LIVE_HIRE_TOOL_IDS = [
  "engenty_tools_search",
  "engenty_tools_discover",
  "engenty_tool_execute",
  "artifact_write",
  "artifact_read",
  "table_write",
  "table_read",
  "app_build",
  // Its own jobs: list, run now, adjust the schedule. Self-scoped inside the
  // tools — a specialist sees and steers only routines it owns. Creating a
  // routine stays a management act (copilot/coordinator), so routines_create
  // is deliberately absent.
  "routines_list",
  "routines_run",
  "routines_update",
  // Governed deterministic work as one step: a specialist may run a PUBLISHED
  // action (human gates intact) instead of improvising the sequence.
  "workflows_list",
  "invoke_workflow",
  // A colleague one message away. Space allow-list and self-refusal live in
  // the tool; leaf depth is budgeted in the delegation layer.
  "message_agent",
  // The pull half of that: a read-only look at a colleague's desk.
  "agent_status",
  // Provider-side web search (search + page reading). A hired specialist
  // whose job is "fetch today's news" is unhirable without it, and the
  // copilot already carries it — the parity rule says the floor follows.
  "web_search",
  // A specialist with a desk chat answers people, and some answers are a
  // surface rather than prose — a term with its explanation, a small set of
  // facts. The A2UI catalog renders in the desk transcript exactly as it does
  // in the copilot's, so the floor follows the surface. In the floor, not the
  // attached list, so rows written before this get it at assembly too.
  "show_ui",
  // Somewhere to keep where a multi-turn exercise stands. A specialist that
  // asks, grades and asks again has no other durable place for "which item,
  // how many wrong" — the transcript is recalled, not read back as state.
  "thread_state_set",
  // Told to work differently from now on, a specialist can put that in
  // writing against its own row. It never applies it: the change lands as a
  // pending revision and a human approves it, so the floor carries a
  // proposal, not a self-promotion.
  "agent_self_revise",
  // The same for the Workflows it owns: a new version for a human to
  // publish, never a new Workflow and never a colleague's.
  "workflow_self_revise",
] as const;

/** Presentation tools attached after a live hire passes the go-live gate. */
export const LIVE_HIRE_ATTACHED_TOOL_IDS = [
  "show_objects",
  "show_artifact",
] as const;

/**
 * The playbooks of the floor's own tools. `space-data` for the Space Data
 * writers, `app-authoring` + `engenty-bridge` for `app_build`: a floor tool
 * whose skill only arrives with a module mount is a tool the agent uses
 * blind — live on 2026-09-06 a specialist with `app_build` and no apps
 * module in its space built from a guessed manifest.
 */
export const LIVE_HIRE_SKILL_IDS = [
  "space-data",
  "app-authoring",
  "engenty-bridge",
] as const;

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
 * The skills a run may open, from the row's own list: every database-sourced
 * agent gets the live-hire set, a top-level one the chief-of-staff playbook
 * on top; module and builtin agents keep their list. One function for the
 * prompt hint (assembly) and the workspace's skill filter (session service):
 * the two must never disagree, or a skill the prompt names is a directory the
 * agent cannot list.
 */
export function preferredSkillIdsForRun(
  config: { skillIds?: readonly string[]; source?: string | null },
  topLevel: boolean
): string[] {
  const own = config.skillIds ?? [];
  if (config.source !== "database") {
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
