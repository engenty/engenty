---
name: durable-work
title: Give existing engenties Routines and Tasks
description: Durable work for EXISTING mounted engenties — a Routine when it repeats, a Task when someone must own it, several linked Tasks when one outcome needs more than one. Complete on its own; a job with no owner switches to hire-agent instead.
license: MIT
allowed-tools: engenty_tools_search engenty_tool_execute registry_agents_list routines_list routines_create routines_update workflows_list workflow_propose requestDecision
metadata:
  engenty:
    category: spaces
---

# Durable work

Load this when work must survive the conversation, run later, repeat, or span
several Tasks — and a mounted Engenty already owns the domain.
If a new recurring job has NO exact owner, load **hire-agent** instead (it
covers the hire and the Routine); do not keep working from this skill, and do
not park the job on Copilot or an unrelated agent.

Prefer the smallest thing that completes the request: live catalog work
(create nothing) → one bounded Engenty run (`message_agent`, or a published
Workflow) → Routine (it repeats; a wake creates a Run, never a Task) → Task (a
work item someone owns) → several linked Tasks (one outcome, real dependencies).

## Survey this Space first

1. Read the injected `current_space`. Unresolved → stop; never widen to the
   tenant.
2. Call `registry_agents_list` in this turn; use only returned ids — the
   injected mounted-ids list is context, not a registry result.
3. List before creating: Task → `tasks_list`; Routine → `routines_list`.
   Reuse or update a real match; never invent an id.
4. If a Workflow may be used, `workflows_list` in this turn — it must be
   runnable and suitable here.

`tasks_*` are catalog operations: `engenty_tools_search` finds them,
`engenty_tool_execute` runs them. `routines_*` are your own tools. Both are
Space-owned — the catalog injects `current_space`; never pass a different
`space_id` or report a record without a successful result.

## Routine for an existing Engenty

A Routine is a job on a mounted Engenty: what to run plus a wake source. The
rules are the ones every engenty follows for its own routines (the
**routines** skill); the only difference here is `agent_id`: the mounted
owner, an exact id from this turn's `registry_agents_list`. After
`routines_list`: change a match with `routines_update`, else
`routines_create` — every field flat on the Routine, no nested body:

- `name`; `agent_id`; `outcome` (what a run must have achieved);
  `outcomes` (destinations — "notify me" = `notification.high`, a quiet
  update = `notification.update`, email = `email` with `config.to`);
  `report` only as the fallback when there are no destinations. The
  notification carries the summary — a `show_widget` in a scheduled run
  does not travel into it;
- **`prompt`** for a single-step job, written to the owner — OR
  **`workflow_id`** when the job has more than one step, an approval, or a
  wait: `workflow_propose` the graph first (`run_by: "routine"`,
  `owner_agent_id` the owner) and target its id; creating the routine
  publishes it. Exactly one of the two;
- `kind: "schedule"`: `cron` + IANA `timezone` in the user's local clock;
  `"event"`: `provider_id` + `resource`; `"manual"` / `"agent"` for a job
  that must not run by itself;
- `approval_grants`: only gated operation ids the procedure actually uses.

Depending on the Space's approval setting the call pauses on a card for the
person — report their answer, never assume it. Grants always take a card.
Only an Engenty can own a Routine — Copilot is refused
(`routines.agentCannotOwn`). `duplicate` → change the Routine it names,
never rename-and-retry.

## One Task someone owns

One bounded result that needs an owner, visible status, and history. A job
that repeats never becomes a Task. Execute `tasks_create` with:

- `title`: a specific imperative outcome;
- `description`: a self-contained brief that defines done, with real record /
  artifact / file references;
- `primary_assignee_kind: "agent"` +
  `primary_assignee_agent_type_key`: an exact id from this turn's
  `registry_agents_list`;
- priority / due date / project only when the request supplies them.

Default `status: "todo"` IS the kickoff — assignment starts a run whose
subject is the Task. Do not also `message_agent`, invent `tasks_dispatch`, or
create a second Task to start the first. `"backlog"` = recorded, not started;
rerun explicitly via `tasks_run_now`. Report the created Task, exact assignee,
and returned status — claim it started only if the result says so.

## An outcome that needs several Tasks

When one Task cannot carry the outcome (decomposition, dependencies, several
engenties), create the Tasks — there is no separate planning record to create
first, and nothing plans on your behalf.

1. Split by owner and by result: each Task names one Engenty and one thing that
   is verifiably done. Put the shared outcome in every description so each run
   is self-contained.
2. Wire real dependencies with `blocked_by_task_ids` — a blocker resolves only
   at `done`, and Tasks without shared blockers run in parallel. Never chain
   independent work by hand or describe order in prose.
3. Any part that repeats is a Routine, not one of these Tasks.
4. Report every Task with its exact assignee and returned status. If the split
   is genuinely ambiguous, `requestDecision` before creating.

## Review when the human asks

Do not survey the board every turn. Notifications tell a person something came
back. When they ask you to review, close, or check assigned work, execute
`tasks_list` for this Space and categorise:

| Category | Condition |
|----------|-----------|
| **Done** | status is a terminal value (done, completed, cancelled, closed, rejected) |
| **Needs review** | status is `in_review` — a run with this task as its subject finished |
| **Blocked** | status is `blocked` — unfinished `blocked_by_task_ids`. Do not nudge. A blocker resolves only at `done`; cancelled does not auto-resolve |
| **Stale** | not terminal AND `updated_at` older than 3 days |

For each **Needs review** task: read its comments (the executing agent posted a
result). If the result satisfies the description, `tasks_update` with
`status: "done"`. If it does not, add a comment explaining what is missing and
`tasks_update` with `status: "todo"`.

For each **stale** task, `tasks_add_comment` with the current status, the
assignee, and the expected next action (or "unclear — manual review needed").

Claim nothing a tool result did not return.
