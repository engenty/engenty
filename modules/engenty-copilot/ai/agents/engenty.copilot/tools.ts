import type { MastraToolDefinition } from "@engenty/ai-core";

// Catalog runner tools attach directly to agents (no engenty-tools sub-agent).
export const ENGENTY_CATALOG_TOOL_IDS = [
  "engenty_tools_context",
  "engenty_tools_discover",
  "engenty_tools_modules",
  "engenty_tool_execute",
  "engenty_tools_preapprove",
  "engenty_tools_search",
];

// Tenant vault storage (Speicher) — paths outside agent workspace mounts.
//
// ONE tool with an `action` discriminator, not the five granular ones: every
// attached schema rides in every model call, and vault IO is a capability most
// turns never touch. The granular tools still exist for agents that name them
// (engenty.file-analyst) and are what `vault_files` dispatches to.
export const ENGENTY_VAULT_TOOL_IDS = ["vault_files"];

// Artifact tools — AI-generated documents rendered in the artifact panel.
// Implementations live in apps/ai (createArtifactTools) and are resolved by the
// builtin registry; these ids gate what the copilot model may call.
// `show_artifact` re-opens one that is no longer in view. It is a BACKEND tool
// returning a presentation handle, not a frontend tool: the surface renders the
// result (pane tab here, a link on a messaging channel, nothing headless), so a
// run with no browser can call it without parking on a suspend nobody resumes.
export const ENGENTY_ARTIFACT_TOOL_IDS = [
  "artifact_write",
  "artifact_read",
  "show_artifact",
  "table_write",
  "table_read",
];

// Object rendering — module entities shown in chat by reference (implemented
// in apps/ai createShowObjectsTool, resolved by the builtin registry).
export const ENGENTY_OBJECT_TOOL_IDS = ["show_objects"];

// Skill self-authoring (approval-gated): draft a SKILL.md proposal from a
// workflow performed successfully more than once; a human enables it.
export const ENGENTY_SKILL_PROPOSE_TOOL_IDS = ["skill_propose"];

// Public skill registry (skills.sh): search + install into this tenant, with
// optional attach to the current space mount / custom agent preferred list.
export const ENGENTY_SKILL_FIND_TOOL_IDS = ["skills_find", "skills_install"];

// Space setup from chat: what this Space has, and adding an app or an account
// to it. ONE tool for both because they are ONE decision — "ich brauche meine
// E-Mails hier" is an app, a mailbox, and how far this Space's engentys may go
// with it (PLAN-connections-ux.md §3b). ONE tool with an `action`
// discriminator, for the reason `vault_files` gives: every schema rides in
// every model call, and Space setup is a capability most turns never touch.
// The write runs on the user's own bearer, so core refuses whoever the setup
// dialog refuses — a member may add an account they own, the rest is admin work.
export const ENGENTY_SPACE_SETUP_TOOL_IDS = ["space_setup"];

// Generative UI — agent-authored sandboxed HTML widgets (show_widget) and
// declarative A2UI surfaces from the engenty catalog (show_ui). Implemented
// in apps/ai, resolved by the builtin registry.
export const ENGENTY_WIDGET_TOOL_IDS = ["show_widget", "show_ui"];

// CSV import helpers — deterministic cleanup (+ optional AI headers).
// Implemented in apps/ai via @engenty/import/server buildCleanupCsvTool.
export const ENGENTY_CSV_TOOL_IDS = ["cleanup_csv"];

// AG-UI frontend tools are NOT listed here: they are registered per-run as native
// Mastra tools (the LLM calls them by name; they suspend the run and the browser
// executes/resumes). No invoke_frontend_tool meta-tool. See
// plans/006-ag-ui-native-frontend-tools.md.
export const ENGENTY_COPILOT_TOOL_IDS = [
  // App building. Originally delegation-only (agent-app_coder), but two live
  // runs showed the routing-tier supervisor dodging delegation and scaffolding
  // "apps" in its own workspace instead — files no user can ever run. The
  // model's path of least resistance must BE the correct path, so the copilot
  // now carries app_build itself: one call runs the durable workflow and
  // publishes the real preview. Delegation remains the route for iterative,
  // multi-step builds; AGENTS.md draws that line.
  "app_build",
  // Hiring. Same lesson as app_build, one tier up: the copilot is where a user
  // says "do this every morning", and durable unattended work needs an agent
  // that is not the copilot. Without this tool the only path it could execute
  // was assigning the routine to ITSELF — which is what live runs did, against
  // explicit skill instructions, because a rule you cannot obey is not a rule.
  // The gate stays where it was: only a base-tool hire in a known space goes
  // live; anything wider suspends on ONE in-chat Approve card.
  "agent_propose",
  // The counterpart: deleting a hired specialist (with its routines and own
  // workflows), or taking a module agent out of the Space. Always a card, in
  // every approval mode.
  "agent_remove",
  "chatThreadSearch",
  // Actions, all three verbs. `workflows_list` turns a name into an id (and
  // shows what already exists); `invoke_workflow` runs a PUBLISHED one — the
  // bridge from the open-ended loop to a governed one, cheaper and auditable
  // with its human gates intact; `workflow_propose` writes a new version for
  // human review and CANNOT publish it. Propose is safe for the same reason
  // agent_propose is: nothing it writes goes live without a person, and the
  // review happens on the canvas, which now opens inside the Space.
  "workflows_list",
  "workflow_propose",
  "invoke_workflow",
  // Routines. A hire FOR RECURRING WORK is not finished until its routine
  // exists, so the surface that can hire must also be able to give the job.
  // A specialist is complete without a routine; a routine is how it also
  // works unattended.
  "routines_list",
  "routines_create",
  "routines_update",
  "message_agent",
  "agent_status",
  "registry_agents_list",
  "requestDecision",
  "requestFeedback",
  "web_search",
  "web_fetch",
  ...ENGENTY_CATALOG_TOOL_IDS,
  ...ENGENTY_VAULT_TOOL_IDS,
  ...ENGENTY_ARTIFACT_TOOL_IDS,
  ...ENGENTY_OBJECT_TOOL_IDS,
  ...ENGENTY_SKILL_PROPOSE_TOOL_IDS,
  ...ENGENTY_SKILL_FIND_TOOL_IDS,
  ...ENGENTY_SPACE_SETUP_TOOL_IDS,
  ...ENGENTY_WIDGET_TOOL_IDS,
  ...ENGENTY_CSV_TOOL_IDS,
];

// Which skill carries which tools.
//
// The copilot's tool block was 73 tools and ~22k tokens on every call, and the
// lanes below fired in NONE of the 143 stored copilot turns we measured. Each
// one already has a skill AGENTS.md tells the model to load first — so the
// skill now brings its tools with it. Activating a skill makes them appear in
// the same turn (see `skill-gated-tools-processor.ts`); nothing here is an
// authorization boundary, only what the model carries around.
//
// A tool listed NOWHERE stays always-on. That is why this map is deliberately
// short of things the copilot does without a lane: `navigate`, `show_objects`,
// `message_agent`, `registry_agents_list`, `artifact_read`,
// `show_artifact`, the catalog meta-tools, `requestDecision`/`requestFeedback`,
// the dock/theme/locale tools, `execute_typescript`, and workspace
// list/read/stat/grep — Space Files at `/data/Files` must not wait on the
// sandbox skill. AGENTS.md mandates `execute_typescript` for bulk writes, so
// it must never need a skill first.
export const ENGENTY_COPILOT_SKILL_TOOL_IDS: Record<string, string[]> = {
  // Hiring a specialist and giving it a standing job. `agent_propose` is the
  // reason this lane exists; the routine and action verbs are what finish it.
  "hire-agent": [
    "agent_propose",
    "agent_remove",
    "agent_status",
    "routines_create",
    "routines_update",
    "routines_list",
    "workflow_propose",
    "workflows_list",
    "invoke_workflow",
  ],
  // Durable work on a specialist that is already mounted — same verbs, no hire.
  "durable-work": [
    "routines_create",
    "routines_update",
    "routines_list",
    "workflow_propose",
    "workflows_list",
    "invoke_workflow",
  ],
  // The routine fields themselves — the playbook every hired engenty shares
  // for its own routines; here it carries the same verbs as durable-work.
  routines: [
    "routines_create",
    "routines_update",
    "routines_list",
    "workflow_propose",
    "workflows_list",
    "invoke_workflow",
  ],
  // Pages, tables and Apps in the active Space. `table_write` alone is the
  // single heaviest tool the copilot carries.
  "space-data": ["table_write", "table_read", "app_build", "cleanup_csv"],
  // Adding an app + its account to the Space.
  "space-setup": ["space_setup"],
  // First setup: the Space's Chief of Staff, then its apps and account.
  "getting-started": ["agent_propose", "agent_status", "space_setup"],
  // Reading and driving the live DOM. `show_ui_guide`, `focusField` and
  // `openDialog` stay always-on: AGENTS.md rule 4 uses them to teach and to
  // move the user to a control, with no skill in front.
  "inspect-ui-dom": [
    "ui_click",
    "ui_dom_snapshot",
    "ui_focus",
    "ui_hover",
    "ui_input",
    "ui_screenshot",
    "ui_scroll",
  ],
  // Free-form work in the sandbox workspace. List/read/stat/grep stay
  // always-on so Space Files at `/data/Files` are reachable without loading
  // this lane — BM25 search does not index `/data`, and hiding list/read made
  // agents conclude the Space had no files. Mutating tools and shell stay here.
  "sandbox-code-execution": [
    "mastra_workspace_delete",
    "mastra_workspace_edit_file",
    "mastra_workspace_execute_command",
    "mastra_workspace_index",
    "mastra_workspace_mkdir",
    "mastra_workspace_search",
    "mastra_workspace_write_file",
    "workspace_copy",
    "workspace_move",
  ],
  // Durable tenant Files (Speicher) — a deliverable surface, not a lane the
  // copilot touches unprompted.
  "artifacts-and-downloads": ["vault_files"],
  // Custom HTML widgets: their schema carries the host bridge, and most
  // turns never need one. show_ui stays out — a stored result comes with
  // its teaser in the chat.
  "rich-ui": ["show_widget"],
  // The public skill registry, and authoring a skill of our own.
  "find-skills": ["skills_find", "skills_install"],
  "engenty-skill-authoring": ["skill_propose"],
};

export interface EngentyCopilotRuntimeTools {
  chatThreadSearch: MastraToolDefinition;
  requestDecision: MastraToolDefinition;
  requestFeedback: MastraToolDefinition;
  webSearch: MastraToolDefinition;
}

export function createEngentyCopilotAgentTools(
  tools: EngentyCopilotRuntimeTools
): Record<string, MastraToolDefinition> {
  return {
    chatThreadSearch: tools.chatThreadSearch,
    requestDecision: tools.requestDecision,
    requestFeedback: tools.requestFeedback,
    web_search: tools.webSearch,
  };
}
