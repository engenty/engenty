// Trigger-ownership rule, read off the agent's DECLARED kind.
//
// It lives in plugin-sdk rather than apps/ai because it answers a question
// modules ask on write paths — "can this agent own standing unattended work?" —
// and a module cannot reach the AI registry. The caller resolves the agent and
// hands the object in; nothing here derives anything from the id string.

/** The declared classification vocabulary — mirrors `AgentConfig.kind`. */
export type AgentKind =
  | "chat_surface"
  | "delegated"
  | "interface"
  | "specialist";

/**
 * Where a trigger came from. `module` triggers are declared in code by a
 * module author (agent.json) and reviewed like code — the memory module's
 * consolidation trigger legitimately runs as the copilot. `custom` triggers
 * are created at runtime by a person or an agent, and are the ones this rule
 * is about.
 */
export type RoutineSource = "custom" | "module";

/** The slice of an agent this rule reads. Absent kind = specialist. */
export interface TriggerOwnerAgent {
  id: string;
  kind?: AgentKind | null;
}

/**
 * True when this agent can own a trigger (a routine binding).
 *
 * A chat surface answers end users on someone else's surface and has no
 * unattended lane at all. A delegated agent exists to be delegated to — work
 * reaches it through a supervisor, never through a schedule of its own. A
 * runtime-created trigger additionally has to be owned by a real worker:
 * only `specialist` — Copilot is the interface, and a trigger parked on it
 * leaves nobody in the Space visibly owning the job. When no specialist fits,
 * the answer is to HIRE one (`agent_propose`), which is what the rejection
 * message says.
 */
export function canAgentOwnTrigger(
  agent: TriggerOwnerAgent,
  source: RoutineSource = "custom"
): boolean {
  const kind = agent.kind ?? "specialist";
  if (kind === "chat_surface" || kind === "delegated") {
    return false;
  }
  if (source === "module") {
    return true;
  }
  return kind === "specialist";
}
