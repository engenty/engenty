// The catalog floor every hired Engenty keeps, whatever else its row
// declares. One list read on both sides: the assembler unions it at run
// time (apps/ai agent-hire-policy) and the hire form shows it as the
// read-only "comes with" set, so what the wizard promises is what the run
// holds.

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
  // And the agent's own voice on its desk between turns: done, needs a look,
  // learned something — a note where the Space reads, plus an inbox update.
  "desk_post",
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
  // Its own face: pick a blob (silhouette + color), generate a new
  // portrait, or propose a name and mandate that fit — in conversation,
  // with a human approve before anything sticks.
  "agent_look",
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
