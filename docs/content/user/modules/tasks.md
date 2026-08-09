---
title: Tasks, goals and triggers
description: Work items agents can pick up, the goals above them, and the triggers that create them on a schedule — with the agent operations for each.
---

# Tasks, goals and triggers

Three related things live here:

- **Tasks** — units of work. A person can do one, or an agent can check it out
  and run it. Tasks carry comments, activity and a history of agent runs.
- **Goals** — the outcome several tasks serve. A goal can be handed to the
  coordinator, which plans and assigns the work under it.
- **Triggers** — rules that create a task on a schedule or when something
  happens, so recurring work does not depend on someone remembering.

This is also where an agent's **tool approvals** for a task are resolved: when a
run needs permission to do something, it pauses and waits for you.

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
| `tasks_standing_by_triggers` | Reads | Newest open task per trigger |
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
| `task_templates_list` | Reads | List task templates |
| `task_templates_create` | Writes | Create task template |
| `task_templates_update` | Writes | Update task template |

### Goals

| Operation | | What it does |
| --- | --- | --- |
| `goals_list` | Reads | List goals |
| `goals_get` | Reads | Get goal by ID |
| `goals_create` | Writes | Create goal |
| `goals_update` | Writes | Update goal |
| `goals_delete` | Writes | Delete goal |
| `goals_handoff` | Writes | Hand a goal to the coordinator to assign and plan |

### Triggers

| Operation | | What it does |
| --- | --- | --- |
| `triggers_list` | Reads | List triggers |
| `triggers_get` | Reads | Get trigger by ID |
| `triggers_create` | Writes | Create trigger |
| `triggers_update` | Writes | Update trigger |
| `triggers_delete` | Writes | Delete trigger |
| `triggers_fire` | Writes | Fire a trigger now, creating its task |
| `triggers_record_result` | Writes | Record the result of a trigger firing |
