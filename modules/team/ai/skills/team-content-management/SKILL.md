---
name: team-content-management
title: Manage team members
description: List, inspect, create, update, and delete team member records, including their connected user accounts, through catalog-backed operations with approval-aware writes.
allowed-tools: engenty_tools_search engenty_tool_execute navigate
---

# Team Members Content Management

Use this skill when the user wants to browse, create, edit, merge, or remove team member records (employees, contractors, external members).

## Spaces

The team directory is tenant-global: a Space mount grants access to the same people. There is no member `space_id` and you must not invent one. Tenant settings live at `/settings/team` (fields, taxonomies, and related tabs). The directory itself is `/mdl/team`.

## Tool Process

1. Start with `engenty_tools_search` using `moduleId: "team"` and `kind: "tool"`.
2. Prefer registered operations: `team_list`, `team_get`, `team_create`, `team_update`, and `team_delete`.
3. Use `engenty_tool_execute` before writes unless the input schema is already clear from this skill and prior tool results.
4. Call the `navigate` tool to open `/mdl/team`, `/mdl/team/:id/edit`, or `/settings/team` when the user should review directory or settings changes in the UI.

## Find Before Writing

- Use `team_list` with `search` when the user names a person but no id is known.
- Use `team_get` before partial edits, merges, or deletes so you work from the current record.

## Create And Update

- Use `team_create` for new records. Provide structured name fields (`first_name`, `last_name`, optional `name_prefix`, `middle_name`, `name_suffix`, `phonetic_name`, `birth_name`) or legacy `full_name` (split on save). Optional `full_name_override` sets a custom display name.
- Use `team_update` with `{ "id": "<profile-id>", "patch": { ... } }` for partial edits. Send only fields that should change.
- Keep payload keys in snake_case (`first_name`, `last_name`, `full_name`, `job_title`, `department`, `employment_status`, `member_type`, etc.).
- Valid `employment_status`: `full_time`, `part_time`, `freelancer`, `contractor`.
- Valid `member_type`: `internal`, `external`, `contractor`.

## Org structure (reports to)

- Manager relationships are stored on org nodes. Use `team_get` on the manager and copy their `org_node_id` into `reports_to_id` on `team_update` (you may also pass the manager's profile `id`; both resolve to the same org node).
- `reports_to_display_name` is read-only in API responses; never send it in create/update patches.
- Clear a manager with `"reports_to_id": null`.

## Merge And Delete

- To merge duplicates, load both records with `team_get`, apply surviving fields with `team_update`, then remove the duplicate with `team_delete`.
- Treat delete as destructive. Confirm the exact person (name + id from `team_get`) before `team_delete`.

## Safety And Reporting

- Write operations require clear user intent. Ask one precise clarification when the target member is ambiguous.
- Prefer update over duplicate creation when a matching record already exists.
- In final summaries, cite human-readable names. Avoid exposing UUIDs unless the user needs an exact id.
