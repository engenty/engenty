---
name: coordinator-workflow
title: Coordinator workflow
description: The Coordinator planning loop — load active goals, claim ownership, audit and create and flag tasks, advance goal status, and produce a run report. Run on every heartbeat or user-triggered cycle.
allowed-tools: engenty_tools_search engenty_tool_execute registry_agents_list
---

# coordinator-workflow

The Coordinator planning loop. Run this on every heartbeat or user-triggered cycle.

## Step 1 — Load active goals

Use `engenty_tools_search` to find the `goals_list` operation, then `engenty_tool_execute` to call it with `status=active`.

If no active goals are found: output "No active goals. Coordinator idle." and stop.

## Step 2 — Claim ownership

For each goal that has no `owner_agent_id`:
- Call `goals_update` with `owner_agent_id: "engenty.coordinator"`.

## Step 3 — Audit existing tasks

For each active goal, call `tasks_list` with `goal_id=<id>`. Categorise each task:

| Category | Condition |
|----------|-----------|
| **Done** | status is a terminal value (done, completed, cancelled, closed, rejected) |
| **Needs review** | status is `in_review` — an agent finished executing it via the task dispatcher |
| **In progress** | has `checkout_run_id` set OR `updated_at` within last 24 hours |
| **Pending** | assigned but not started, updated recently — agent-assigned tasks are dispatched automatically; do not nudge them |
| **Stale** | not in terminal status AND `updated_at` older than 3 days |
| **Missing** | key areas of the goal have no task at all |

For each **Needs review** task: read its comments (the executing agent posted a result comment prefixed `🤖`). If the result satisfies the task description, call `tasks_update` with `status: "done"`. If it does not, add a comment explaining what is missing and call `tasks_update` with `status: "todo"` — the dispatcher will re-execute it with your feedback in the thread.

## Step 4 — Create missing tasks

For each gap identified in Step 3, create a task with `tasks_create`:

```
{
  title: "<specific imperative title>",
  goal_id: "<goal id>",
  primary_assignee_kind: "agent",
  primary_assignee_agent_type_key: "<id from registry_agents_list — must be exact>",
  priority: "<derived from goal urgency>",
  description: "<2-5 sentences: what to do, what done looks like>",
  due_date: "<goal.target_date if set, else null>"
}
```

Do not create a task if an equivalent one already exists (same goal, same domain, non-terminal).

## Step 5 — Flag stale tasks

For each stale task, call `tasks_add_comment` with:

```
Coordinator heartbeat — <ISO date>: This task has not been updated in 3+ days. 
Current status: <status>. Assignee: <assignee>. 
Expected next action: <brief description or "unclear — manual review needed">.
```

## Step 6 — Advance goal status

After processing all tasks for a goal:

- If ALL tasks are in terminal status → call `goals_update` with `status: "achieved"`
- If goal has been active >14 days with no task progress → add a comment on the oldest non-terminal task: "Coordinator: goal has been active >14 days with no measurable progress. Consider cancelling or replanning."

## Step 7 — Summary report

Produce a final structured output:

```
## Coordinator run — <ISO datetime>

Goals processed: N
  - <goal title> [<status>]: <tasks created>/<tasks total> tasks, <stale count> stale
  ...

Tasks created: N
Tasks reviewed (in_review → done / sent back): N
Tasks flagged as stale: N
Goals advanced to achieved: N
```
