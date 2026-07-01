---
name: contacts-content-management
title: Contacts content management
description: Create, update, delete, role-tag, and relate Contacts records through catalog-backed operations with duplicate checks and approval-aware writes.
allowed-tools: engenty_tools_search engenty_tool_execute contacts_apply_draft_patch
---

# Contacts Content Management

Use this skill when the user wants to create, inspect, edit, delete, add roles to, or connect stored contact records.

## Tool Process

1. Start with `engenty_tools_search` using `moduleId: "contacts"` and `kind: "tool"`.
2. Prefer registered operations such as `contacts_contact_search`, `contacts_get`, `contacts_create`, `contacts_update`, `contacts_delete`, `contacts_add_contact_role`, `contacts_create_relation`, `contacts_update_relation`, and `contacts_delete_relation`.
3. Use `engenty_tool_execute` before writes unless the input schema is already clear from this skill and prior tool results.
4. Use catalog-discovered HTTP routes only for capabilities not yet exposed as `contacts.*` operations.

## Find Before Writing

- Use `contacts_contact_search` before creating a person, organisation, or relation so duplicates are visible.
- Use `contacts_get` before partial edits, risky changes, or role/relation decisions.
- Use `contacts_list_relations` before creating a relation when the user may be asking for an existing link.

## Create And Update

- Use `contacts_create` for new records. Organisations need `type: "organisation"` plus `display_name` or `legal_name`. Persons need `type: "person"` plus structured name fields (`first_name`, `last_name`, optional `name_prefix`, `middle_name`, `name_suffix`, `phonetic_name`, `birth_name`) or legacy `display_name` (split on save). Optional `display_name_override` sets a custom list label.
- Use `contacts_update` with `{ "id": "<contact-id>", "patch": { ... } }` for partial edits. Send only fields that should change.
- Keep payload keys in snake_case and use schema-real field names.
- For roles, use `contacts_add_contact_role` only when the user clearly asks to classify a contact.
- For person-to-organisation links, use `contacts_create_relation` with a clear relation type such as `works_at` only after both contacts are identified.

## Edit-page draft (browser only)

When the user is on a contact **edit** screen and the host has registered `contacts_apply_draft_patch`, apply in-form draft changes by calling the `contacts_apply_draft_patch` tool with `patch` as JSON Patch operations on known form fields. Organisation enrichment on detail view should stay read-only in chat until the user saves the form.

## Safety And Reporting

- Write operations require clear user intent. If the requested write target is ambiguous, ask one precise clarification before running a write.
- Prefer update or role/relation changes over duplicate creation when an existing contact matches.
- Treat delete as destructive. Confirm exact contact id/name before using `contacts_delete`.
- In final summaries, cite human-readable names and the operation result. Avoid exposing UUIDs unless the user needs an exact id.
