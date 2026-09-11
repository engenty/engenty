---
name: projects-management
title: Projects management
description: Create, update, delete, and configure projects including team assignment, client linking, portal settings, and module-level settings through catalog-backed operations.
allowed-tools: engenty_tools_search engenty_tool_execute load_project load_projects_list manage_project navigate
---

# Projects Management

Use this skill when the user wants to create, edit, delete, or configure projects — including team members, client assignment, portal setup, and module settings.

## Space scope
- Projects are space-owned. List and create in `current_space`; never omit space scope in a Space-bound run.
- Direct ids (get/update/delete) must belong to the active Space. A project from another Space is not part of this run — do not retry the same id.

## Tool Process
1. Start with `engenty_tools_search` using `moduleId: "projects"` and `kind: "tool"`.
2. Prefer registered operations: `projects_list`, `projects_get`, `projects_create`, `projects_update`, `projects_delete`, `projects_settings_get`, `projects_settings_update`.
3. Use `engenty_tool_execute` before writes unless the input schema is already clear from this skill and prior tool results.
4. Call the `navigate` tool to open `/mdl/projects` or `/mdl/projects/:id` when the user should review changes in the UI.

## Find Before Writing
- Use `load_projects_list` with `search` when the user names a project but no id is known.
- Use `load_project` before partial edits, deletes, or team/portal changes so you work from the current record.

## Create And Update
- Use `projects_create` for new projects. Required: `title`. Optional: `briefing`, `start_date`, `end_date`, `client_id`, `client_name`, `lead_id` (team member UUID), `portal_enabled`, `portal_password`, `portal_intro_text`, `created_by`, `team_member_ids`.
- Use `projects_update` with `{ "id": "<project-id>", "patch": { ... } }` for partial edits. Send only fields that should change.
- Keep payload keys in snake_case.

## Team Management
- Set `team_member_ids` (array of user UUIDs) on create or update to assign project members.
- For fine-grained role control, use `project_team` array on update: `[{ "user_id": "...", "role": "project-lead" | "project-member" | "project-external", "role_name": "optional custom label" }]`.
- The project `lead_id` designates the overall project lead — this is separate from the `project-lead` team role.
- Assigning a user to a task auto-adds them to the project team. Removing a user from the team unassigns them from all project tasks.

## Client Assignment
- Set `client_id` to a contact UUID to link a client. Optionally set `client_name` for display.
- When the contacts module is active, setting `client_id` auto-tags the contact with a "client" role.
- Clear the client with `"client_id": null`.

## Portal Settings
- Enable the public client portal by setting `portal_enabled: true` on project update.
- Protect with `portal_password` (plain text string). Set `portal_intro_text` for a custom welcome message.
- Control which phases and tasks are visible on the portal via `projects_update_visibility` (sets `is_public` on individual phases/tasks).
- The portal is accessible at `/portal/:projectId` — clients verify with the password.

## Module Settings
- Use `projects_settings_get` to read current settings.
- Use `projects_settings_update` to modify:
  - `briefing_overdue_days` (1–90): days after which items are considered stale.
  - `default_task_statuses`: array of status IDs applied to new projects.
  - `task_status_definitions`: array of `{ id, label, color, locked? }`. Colors: slate, blue, orange, purple, green, zinc, red. Locked statuses (`todo`, `in_progress`, `done`) cannot be removed.

## Safety And Reporting
- Delete is critical-risk. Confirm the exact project title and id (from `load_project`) before `projects_delete`.
- Write operations require clear user intent. Ask one precise clarification when the target project is ambiguous.
- In final summaries, cite project titles. Avoid exposing UUIDs unless the user needs an exact id.
