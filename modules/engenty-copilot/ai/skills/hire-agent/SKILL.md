---
name: hire-agent
title: Hire and configure an Engenty
description: Create, revise, or mount a custom Engenty AND give its recurring job a Routine. Complete on its own — do not also load work-routing or durable-work.
allowed-tools: engenty_tools_search engenty_tool_execute registry_agents_list agent_propose workflows_list workflow_propose invoke_workflow requestDecision
---

# Hire an agent

Load this to hire, revise, or mount a custom Engenty — including a
NEW recurring job that has no exact Engenty owner. This skill covers the
whole path through the Routine; load no other lane skill with it.

A recurring job is complete only when the Engenty is mounted in this Space
AND its Routine exists. Hiring alone makes nothing run.

## Survey this Space first

1. Read the injected `current_space`. Unresolved → stop; do not widen to the
   tenant.
2. Call `registry_agents_list` in this turn; use only returned ids. Reuse a
   mounted Engenty only when its returned description already owns this
   exact job — similar domain knowledge is not enough.
3. For recurring work, list this Space's Routines (`engenty_tools_search` →
   `routines_list` → `engenty_tool_execute`). A Routine that covers the job
   gets updated, not duplicated.
4. If a Workflow may be the Routine body, call `workflows_list` in this turn and
   use only a returned, published Workflow whose required input the Routine can
   supply.

## Create and mount an Engenty

Call `agent_propose` with:

- `id`: `<domain>.<role>` named for the job (`invoices.chaser`), never for a
  schedule or Copilot;
- `name`: the visible job title;
- `description`: a concise summary of the standing mandate;
- `instructions`: what it owns, its boundaries, judgment calls — keep the
  Routine's step-by-step procedure out of the mandate;
- `for_work`: `routine` | `tasks` | `chat` (the actual next lane);
- `agent_scope`: `shared` unless explicitly personal;
- `tool_ids: []`, `skill_ids: []` by default — the stored agent still gets the
  catalog tools, the Space Data writers, and the space-data skill; approvals
  still gate catalog writes. Name extras only when the mandate requires them.

With a resolved Space, a base-tool hire goes live and mounts in the same call.
Extras, a missing Space, or reusing an existing id make it a gated proposal:
report the pending revision, never click Approve, continue when the approval
resumes. Never claim the agent exists or is mounted without that tool result;
there is no `agents_create` / `agents_update` / `space_agents_mount`.

## Give the job its Routine

After a successful live hire (or immediately when an approval resumes
approved), search for `routines_create` and execute it — every field flat on
the Routine, no nested body:

- `name`; `kind`: `schedule` | `event`; `agent_id`: the exact hired id;
- `instructions`: the full operating procedure — OR `workflow_id` of a published
  Workflow, exactly one of the two. A job of more than one step, an approval, or
  a wait belongs in a Workflow: `workflow_propose` the multi-step graph first (it
  awaits human review on the canvas — never publish it yourself) and target its
  id. Prose is only for a genuinely single-step job;
- schedule: `cron` + IANA `timezone` in the user's local clock ("07:00 Vienna"
  = `cron: "0 7 * * *", timezone: "Europe/Vienna"`) — never convert to UTC;
- event: real `provider_id` and `resource`;
- `approval_grants`: only the gated operation ids the procedure actually uses,
  named to the user before creation.

Only an Engenty can own a Routine — Copilot is refused
(`routines.agentCannotOwn`). `duplicate` → update the Routine it names, never
rename-and-retry. The hire is not the deliverable: stop only after
`routines_create` succeeds, then report owner, job, and schedule. Even when a
Workflow is the target, the Space still gets a visible owner and Routine.

Links in your report stay inside this Space: the Engenty's page is
`/s/<current_space key>/agents/<agent_id>`, and a draft Workflow awaiting
publish sits on its Manage tab — `/s/<key>/agents/<agent_id>?tab=manage`.
Never link `/admin/...`; that navigates the user out of their Space.

## Revise an existing custom agent

`agent_propose` with the same exact `id` and the complete revised
configuration — always a gated revision; the approved config keeps running
meanwhile. If the change affects a recurring job, patch the Routine row via
`routines_list` → `routines_update`: wake fields (`cron`, `timezone`,
`quiet_hours`, `enabled`) and target fields (`instructions` or `workflow_id`,
`name`, `description`, `outcome`, `report`) all live flat on it. Moving a job
to another Engenty = create on the new owner, delete the old.
