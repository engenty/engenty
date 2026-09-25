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
  // Its own jobs: list, create, run now, adjust. Self-scoped inside the
  // tools — a specialist sees, steers and creates only routines it owns.
  // "Do this every Friday" said to the engenty that owns the job used to
  // fail silently because only a manager held routines_create; whether a
  // person confirms first is the Space's approval mode, not the tool list.
  "routines_list",
  "routines_create",
  "routines_run",
  "routines_update",
  // Governed deterministic work as one step: a specialist may run a PUBLISHED
  // action (human gates intact) instead of improvising the sequence — and
  // write the multi-step body of its own routine (workflow_propose is
  // self-scoped: a specialist proposes Workflows for its own page only).
  "workflows_list",
  "workflow_propose",
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
  // What an installer left on the Space's computer — skills, remote MCP
  // servers — offered to the Space. Both only offer: a person adds the
  // skill on the card and approves the connector import.
  "computer_skills_find",
  "connector_import_request",
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
  // Its own standing jobs: prompt or Workflow, the wake sources, the
  // promise, and who says yes. The routine verbs ride with it (below).
  "routines",
] as const;

/**
 * Which floor tools ride with which floor skill. A tool named here is
 * withheld from the tool block until its skill is active and appears in
 * the same turn (skill-gated-tools-processor); everything else on the floor
 * is always offered. Visibility only — attachment, the Space gate and the
 * approval gate are untouched.
 *
 * The point is the prompt: every schema a specialist carries rides in every
 * call, and the floor grows one lane at a time. Gated, a new lane costs the
 * standing prompt its skill's name and nothing else. Same mechanism the
 * copilot went from ~22k tokens of tools to its lanes with.
 *
 * Kept short of what a specialist does without a lane: the catalog path,
 * artifact_read, colleagues, the desk note, web search, invoke_workflow,
 * show_ui, thread state, the self-revise pair and its own look.
 */
export const SPECIALIST_TOOL_GATING: Readonly<
  Record<string, readonly string[]>
> = {
  // Loading the app playbook must not leave app_build behind: a tool under
  // two skills appears when either is active.
  "app-authoring": ["app_build"],
  routines: [
    "routines_create",
    "routines_update",
    "routines_list",
    "routines_run",
    "workflow_propose",
    "workflows_list",
  ],
  // Pages, tables and Apps in the Space. table_write alone is the single
  // heaviest schema on the floor.
  "space-data": ["table_write", "table_read", "artifact_write", "app_build"],
};
