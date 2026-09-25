---
name: hire-agent
title: Hire and configure an Engenty
description: Create, revise, or mount a custom Engenty AND give its recurring job a Routine. Complete on its own — do not also load work-routing or durable-work.
allowed-tools: engenty_tools_search engenty_tool_execute registry_agents_list agent_propose agent_remove workflows_list workflow_propose invoke_workflow requestDecision
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
3. For recurring work, call `routines_list` (it arrives with this skill). A
   Routine that covers the job gets updated, not duplicated.
4. If a Workflow may be the Routine body, call `workflows_list` in this turn and
   use only a returned Workflow whose required input the Routine can supply —
   a draft is fine, creating the routine publishes it.

## Create and mount an Engenty

Call `agent_propose` with:

- `id`: `<domain>.<role>` named for the job (`invoices.chaser`), never for a
  schedule or Copilot;
- `name`: the visible job title;
- `description`: a concise summary of the standing mandate;
- `engenty`: one of the ten blobs that fits the job (`round` cobalt, `drop` amber, `dome` moss, `flame` rose, `oval` ember, `bean` teal, `pebble` slate, `sprout` citron, `tower` violet, `wedge` magenta). Omit only when you have no cue — the id is then hashed to a kind. After hire, the Engenty can change that look (and its name) on its own desk with `agent_look`;
- `instructions`: what it owns, its boundaries, judgment calls — keep the
  Routine's step-by-step procedure out of the mandate. Never write shell commands (`date`, `curl`, scripts) into it: every run already knows today's date and time, web research goes through `web_search` / `web_fetch`, and a command becomes an approval card with raw shell for the person.;
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

## Hire a Chief of Staff (coordinator)

A Chief of Staff / coordinator / lead is the Engenty that runs this Space —
not an assistant with a recurring job. Every hire mounted without a manager
already is one: at run time it carries the setup and hiring tools and the
**chief-of-staff** playbook (set the Space up, route work, hire and
coordinate teammates). That playbook is the hire's, handed to it at run time —
it is not in your catalog, so do not search for it. Its mandate is fixed; do
not ask what it should do and do not offer assistant jobs (briefing, inbox,
meeting prep) as its mandate.

- `id`: `<space>.chief-of-staff`, `name`: "Chief of Staff", `engenty`: `round`;
- `description`: "Sets the space up, routes work, hires a teammate when a
  job deserves its own owner, and does what nobody else owns yet.";
- `instructions`: that mandate, plus "Load the **chief-of-staff** skill for
  setup, routing and hiring — it is your playbook here.";
- `for_work`: `chat`. The hire is complete without a Routine — people talk to
  it. Offer a Routine only when the person names a recurring job.

## Give the job its Routine

After a successful live hire (or immediately when an approval resumes
approved), call `routines_create` — every field flat on the Routine, no
nested body:

- `name`; `kind`: `schedule` | `event`; `agent_id`: the exact hired id;
  `outcomes`: where the result
  goes — "notify me" is `notification.high` (the notification opens the
  artifact the run stored); `report` only without destinations;
- `prompt`: the full operating procedure for a single-step job, written to
  the hire — OR `workflow_id`, exactly one of the two. A job of more than one
  step, an approval, or a wait belongs in a Workflow: `workflow_propose` the
  graph first (`run_by: "routine"`, `owner_agent_id` the hire) and target its
  id; creating the routine publishes it. Prose is only for a genuinely
  single-step job;
- schedule: `cron` + IANA `timezone` in the user's local clock ("07:00 Vienna"
  = `cron: "0 7 * * *", timezone: "Europe/Vienna"`) — never convert to UTC;
- event: real `provider_id` and `resource`;
- `approval_grants`: only the gated operation ids the procedure actually uses.

Depending on the Space's approval setting the call pauses on ONE card for the
person (it publishes the Workflow and creates the routine together) — report
their answer, never assume it. Grants always take a card. Only an Engenty can
own a Routine — Copilot is refused (`routines.agentCannotOwn`). `duplicate` →
update the Routine it names, never rename-and-retry. The hire is not the
deliverable: stop only after `routines_create` returns `created`, then report
owner, job, and schedule. Even when a Workflow is the target, the Space still
gets a visible owner and Routine.

Links in your report stay inside this Space: the Engenty's page is
`/s/<current_space key>/agents/<agent_id>`; its routines and Workflows sit on
its Manage tab — `/s/<key>/agents/<agent_id>?panel=manage`. Never link
`/admin/...`; that navigates the user out of their Space.

## Revise an existing custom agent

`agent_propose` with the same exact `id` and the complete revised
configuration — always a gated revision; the approved config keeps running
meanwhile. If the change affects a recurring job, patch the Routine row via
`routines_list` → `routines_update`: wake fields (`cron`, `timezone`,
`quiet_hours`, `enabled`) and target fields (`prompt` or `workflow_id`,
`name`, `description`, `outcomes`, `report`) all live flat on it. Moving a job
to another Engenty = `routines_update` with the new `agent_id`.

## Remove an Engenty

`agent_remove` with its `agent_id` — always shows the person a card first,
whatever the Space's approval setting:

- a **custom** (hired) Engenty is deleted with its routines and the workflows
  it owns — cannot be undone;
- a **module** agent is only removed from this Space: its routines here are
  paused, its open tasks here unassigned, and it can be added back.

The copilot, coordinators and you yourself cannot be removed.
