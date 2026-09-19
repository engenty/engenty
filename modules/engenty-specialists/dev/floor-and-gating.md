# The floor, and what rides with a skill

A hired engenty (`kind === "specialist"`, `source === "database"` — and a
module-shipped specialist alike) runs with more than its row declares. The
row says what the job needs; the floor says what every job needs.

## Layers, in the order assembly applies them

| Layer | Where | Applied |
| --- | --- | --- |
| Floor tools — `LIVE_HIRE_TOOL_IDS` | `ai/floor.ts` (physically `@engenty/ai-core` `agents/hire-floor.ts`) | `withCatalogFloor` on every specialist |
| Floor skills — `LIVE_HIRE_SKILL_IDS` (`space-data`, `app-authoring`, `engenty-bridge`, `routines`) | same | `withLiveHireSkills` — the prompt hint and the workspace `/skills` filter read one list (`preferredSkillIdsForRun`) |
| Top-level set — `FIRST_ENGENTY_TOOL_IDS` + `chief-of-staff` | `ai/floor.ts` (`first-engenty.ts`) | only when the mount has no `reports_to` — a lead hired blank, or promoted by clearing its manager, grows the team without a re-hire |
| Presentation — `LIVE_HIRE_ATTACHED_TOOL_IDS` | same | after a live hire passes the go-live gate |
| Row's own `toolIds` / `skillIds` | registry | always |

The hire wizard's "Comes with" reads the same floor list, so what the dialog
promises is what the run holds (`SpaceAgentHireCapabilities.tsx`).

## Lanes: which tools a skill brings

`SPECIALIST_TOOL_GATING` names the floor tools that are withheld from the
tool block until their skill is active — and appear in the same turn when it
is (`skill-gated-tools-processor.ts`). Visibility only: every tool stays
attached, Space-gated and approval-gated.

- `routines` → `routines_create`, `routines_update`, `routines_list`,
  `routines_run`, `workflow_propose`, `workflows_list`
- `space-data` → `table_write`, `table_read`, `artifact_write`, `app_build`
- `app-authoring` → `app_build` (a tool under two skills appears when either
  is active)

Always on: the catalog path (`engenty_tools_search` / `_discover` /
`engenty_tool_execute`), `artifact_read`, colleagues (`message_agent`,
`agent_status`), `desk_post`, `web_search`, `invoke_workflow`, `show_ui`,
`thread_state_set`, the self-revise pair, `agent_look`.

Why: every schema a specialist carries rides in every model call, and the
floor grows one lane at a time. Gated, a new lane costs the standing prompt
its skill's name and nothing else — the same mechanism that took the copilot
from ~22k tokens of tool schemas to its lanes. `effectiveToolGating` unions
the row's own `toolGating` with the floor's; `SKILL_GATED_TOOLS_INSTRUCTIONS`
tells the model the gate exists, or it reads an absent tool as an absent
capability.

## Why the constants are not in this module

`apps/ui` bundles the floor and the engenty kinds through
`@engenty/ai-core/browser` (the wizard, `agent-face`, the roster). This
module depends on ai-core for its contract types, so ai-core depending on
this module for the constants would be a cycle. `ai/floor.ts` re-exports
them and is the documented entry; a symbol added in ai-core and not here is a
symbol nobody finds.
