---
title: Projects
description: Projects, phases and their tasks, plus what clients see in the portal — and the agent operations the copilot uses.
---

# Projects

A project groups work into **phases**, and phases hold **tasks**. Each phase and
task can be marked visible in the client portal, so the same project serves both
your internal planning and what the client is shown.

Tasks created here are the same records the [Tasks](/user/modules/tasks) module
manages, so an agent can pick one up and work it.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

| Operation | | What it does |
| --- | --- | --- |
| `projects_list` | Reads | List projects |
| `projects_get` | Reads | Get project by ID |
| `projects_list_tasks` | Reads | List tasks across projects (paginated) |
| `projects_task_counts` | Reads | Task counts by status |
| `projects_settings_get` | Reads | Get project settings |
| `projects_create` | Writes | Create project |
| `projects_update` | Writes | Update project |
| `projects_delete` | Writes | Delete project |
| `projects_create_phase` | Writes | Create a phase |
| `projects_update_phase` | Writes | Update a phase |
| `projects_delete_phase` | Writes | Delete a phase |
| `projects_create_task` | Writes | Create a task in a project |
| `projects_create_tasks` | Writes | Create several tasks in one call |
| `projects_update_task` | Writes | Update a project task |
| `projects_delete_task` | Writes | Delete a project task |
| `projects_update_visibility` | Writes | Toggle portal visibility on a phase or task |
| `projects_settings_update` | Writes | Update project settings |

`projects_create_tasks` exists so that "break this project into tasks" is one
operation rather than fifteen — worth asking for when you want a plan filled in
at once.
