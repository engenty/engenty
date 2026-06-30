---
name: projects-task-management
title: Projects task management
description: Manage project phases and tasks — create, update, delete, reorder, toggle portal visibility, and track status — through catalog-backed project operations.
allowed-tools: engenty_tools_search engenty_tool_execute load_project load_project_tasks manage_project_phase manage_project_task navigate
---

# Projects Task Management

Use this skill when the user wants to manage phases (milestones) or tasks within a project — create, edit, delete, reorder, change status, assign team members, or toggle portal visibility.

## Tool Process
1. Start with `engenty_tools_search` using `moduleId: "projects"` and `kind: "tool"`.
2. Prefer registered operations: `projects_create_phase`, `projects_update_phase`, `projects_delete_phase`, `projects_create_task`, `projects_update_task`, `projects_delete_task`, `projects_list_tasks`, `projects_task_counts`, `projects_update_visibility`.
3. Use `load_project` first to understand the project structure (existing phases, tasks, statuses).
4. Call the `navigate` tool to open `/mdl/projects/:id` when the user should review changes.

## Phases
- A phase groups tasks into a milestone or time period. Fields: `title` (required), `start_date`, `end_date`, `is_main` (boolean — marks the primary/active phase), `is_public` (boolean — portal visibility), `order_index` (integer — display order).
- Use `projects_create_phase` with `{ project_id, title, ... }` to create. When adding a phase, check if it already exists (similar name) to avoid duplications.
- Use `projects_update_phase` with `{ project_id, phase_id, patch: { ... } }` to edit.
- Use `projects_delete_phase` with `{ project_id, phase_id }` to remove. Orphaned tasks remain in the project without a phase.

## Tasks
- A task is a work item within a project, optionally inside a phase. Fields: `title` (required), `content` (description), `phase_id` (nullable — assign to a phase or leave as general task), `discipline`, `hours` (estimated), `status`, `is_public` (portal visibility), `order_index`, `team_member_ids` (assignees).
- Use `projects_create_task` with `{ project_id, title, ... }`. Status defaults to `todo` if omitted and must be a valid status from project settings.
- Use `projects_update_task` with `{ project_id, task_id, patch: { ... } }`. Validate status against project settings before changing.
- Use `projects_delete_task` with `{ project_id, task_id }`.

## Task Listing And Counts
- Use `projects_list_tasks` to query tasks across projects. Filters: `project_id`, `phase_id`, `assigned_to` (user UUID), `status`, `scope` (`mine` | `all`), `search`. Supports pagination (`page`, `pageSize`) and sorting (`sortBy`: updated_at|created_at|title|status, `sortOrder`: asc|desc).
- Use `projects_task_counts` for a quick status breakdown: returns `{ "todo": 5, "in_progress": 3, ... }`.

## Visibility (Portal)
- Use `projects_update_visibility` with `{ entity_type: "phase" | "task", project_id, entity_id, is_public: true|false }` to toggle portal visibility.
- Only phases and tasks marked `is_public: true` appear on the client portal.

## Status Flow
- Built-in statuses: `backlog`, `todo`, `in_progress`, `in_review`, `request`, `done`, `cancelled`, `blocked`.
- Locked statuses (`todo`, `in_progress`, `done`) cannot be removed from project settings.
- Custom statuses can be added via `projects_settings_update`. Each definition: `{ id, label, color, locked? }`. Colors: slate, blue, orange, purple, green, zinc, red.
- Always check valid statuses via `projects_settings_get` or `load_project` before setting a task status.

## Safety And Reporting
- Confirm before deleting phases (child tasks become general/unphased, not deleted).
- Confirm before deleting tasks — this is destructive.
- In summaries, cite task titles and current status. Mention phase grouping when relevant.

## Starter Prompts
- Add a new phase to this project.
- Create a task in the current phase.
- Show me a status breakdown of all tasks.
- Make this phase visible on the client portal.
