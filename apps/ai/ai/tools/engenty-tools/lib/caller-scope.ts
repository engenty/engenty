// Who is calling a routine or Workflow tool, as the tool decides what it may
// reach: the management surface (copilot) sees and steers everything, a
// coordinator (a hired engenty that reports to nobody in this Space) the
// Space it answers for, a specialist only what it owns. Same tool objects for
// everyone — the registry is global — so the narrowing happens from the run's
// own agent identity, never from which agent declared the tool.
import { getEngentyToolsRunContext } from "./run-context.js";
import { isUnresolvedSpaceGate } from "./space-gate.js";

/** The two management surfaces: the copilot, and nothing else yet. */
const MANAGEMENT_AGENT_IDS = new Set(["engenty.copilot"]);

export type CallerScope =
  | { kind: "management" }
  | { id: string; kind: "coordinator" }
  | { id: string; kind: "specialist" };

/**
 * `agentTypeKey` is the registry key routines are stored under
 * ("news.orf-briefing"); `agentId` is the core.agents AUTHORIZATION uuid —
 * scoping on it filtered every specialist down to zero routines.
 */
export function callerScope(): CallerScope {
  const ctx = getEngentyToolsRunContext();
  const key = ctx.agentTypeKey?.trim() ?? "";
  if (!key || MANAGEMENT_AGENT_IDS.has(key)) {
    return { kind: "management" };
  }
  const space =
    ctx.space && !isUnresolvedSpaceGate(ctx.space) ? ctx.space : null;
  if (space?.topLevelAgentIds?.has(key)) {
    return { id: key, kind: "coordinator" };
  }
  return { id: key, kind: "specialist" };
}

/** The coordinators of the run's Space, for a refusal that names who to ask. */
export function coordinatorIdsForRun(): string[] {
  const ctx = getEngentyToolsRunContext();
  const space =
    ctx.space && !isUnresolvedSpaceGate(ctx.space) ? ctx.space : null;
  return [...(space?.topLevelAgentIds ?? [])].sort((a, b) =>
    a.localeCompare(b)
  );
}
