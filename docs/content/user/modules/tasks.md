---
title: Tasks and routines
description: Work items agents can pick up and the routines that run jobs on a schedule — with the agent operations for each.
---

# Tasks and routines

Two related things live here:

- **Tasks** — units of work. A person can do one, or an agent can be assigned
  one and work it. Tasks carry comments, activity and a history of agent runs.
- **Routines** — jobs an Engenty runs on a schedule or when something
  happens, so recurring work does not depend on someone remembering. A routine
  produces runs, never tasks.

This is also where an agent's **tool approvals** for a task are resolved: when a
run needs permission to do something, it pauses and waits for you.

## When work becomes a task

Not every Copilot message creates a task. Copilot keeps bounded work live when
it can answer, run a module operation, or ask a mounted Engenty while you
wait.

Use a task when work should survive closing the chat, wait for time or another
task, repeat, request approval later, or keep assignment and progress history:

- **One durable item:** Copilot can create a task and assign a mounted
  Engenty directly.
- **Several coordinated items:** create one task per result and link the real
  dependencies between them. Assigning one starts a run on its assignee.
- **Recurring work:** create a Routine — a job on an Engenty, with a schedule
  or an event as its wake source. Each fire is its own run, and no task
  appears.

A mounted Engenty can therefore be reached in two ways: a live
`message_agent` call returns to the current chat, while task assignment runs
durably and reports through task comments, status, inbox, and briefing.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

### Tasks

| Operation | | What it does |
| --- | --- | --- |
| `tasks_list` | Reads | List tasks |
| `tasks_get` | Reads | Get task by ID |
| `tasks_list_activity` | Reads | List task activity |
| `tasks_list_runs` | Reads | List agent runs on a task |
| `tasks_settings_get` | Reads | Get task module settings |
| `tasks_approval_grants_effective` | Reads | Which tool approvals a task's next run would have |
| `tasks_create` | Writes | Create task |
| `tasks_update` | Writes | Update task |
| `tasks_delete` | Writes | Delete task |
| `tasks_add_comment` | Writes | Add a comment |
| `tasks_run_now` | Writes | Queue an agent run for this task now |
| `tasks_checkout` | Writes | Check the task out for agent work |
| `tasks_release` | Writes | Release an agent checkout |
| `tasks_reap_stale_checkouts` | Writes | Release checkouts whose run has died |
| `tasks_resolve_tool_approval` | Writes | Approve or deny a pending tool approval |
| `tasks_clear_once_approvals` | Writes | Clear a task's one-shot approvals |
| `tasks_settings_update` | Writes | Update task module settings |

### Routines

| Operation | | What it does |
| --- | --- | --- |
| `routines_list` | Reads | List routines |
| `routines_get` | Reads | Get routine by ID |
| `routines_create` | Writes | Create routine |
| `routines_update` | Writes | Update routine |
| `routines_delete` | Writes | Delete routine |
| `routines_run` | Writes | Run a routine now, starting a run |
