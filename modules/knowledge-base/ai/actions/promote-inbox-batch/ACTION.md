---
id: knowledge-base.promote-inbox-batch
agent_id: knowledge-base.manager
name: Promote inbox to multiple draft articles (batch)
description: Build a reviewed POST /api/kb/inbox/:id/promote-batch body for multi-page wiki captures; articles only; explicit human approval before API calls.
default_thread_mode: new
skills: kb-ingest
allowed-tools: engenty_tools_search engenty_tool_execute web_search
input_schema_json:
  description: Inbox item id.
  type: object
  additionalProperties: false
  properties:
    inbox_id:
      type: string
      minLength: 1
---

# Promote inbox (batch)

## Task

Produce a reviewed **`POST /api/kb/inbox/:id/promote-batch`** JSON body that creates **one or more draft articles** from a single inbox row, with **one** `primary_index` for which article becomes `inbox.promoted_article_id`. The server inserts **source_references** per article and closes the inbox once (all-or-nothing).

## Body (snake_case)

- `primary_index` (optional, default `0`): index into `steps` for the primary promoted article (UI navigation target).
- `steps`: non-empty array (max 20). Each step:
  - `title` (required)
  - `content_markdown` (optional; server falls back to inbox raw when omitted on creates)
  - `tag_ids`, `status` (optional; default `draft`)
  - **Parent**: either `parent_article_id` (existing article in the same KB) **or** `parent_step_index` (0-based index of an **earlier** step that creates/updates the parent article), never both.
  - `update_article_id` (optional): PATCH semantics for an existing article in that step.

## Steps

1. Load the inbox row with `kb_inbox_get` or the catalog-discovered `GET /api/kb/inbox/:id` route and read `triage_metadata` when present (prefer **v2** `promote_steps` if the editor already saved a plan).
2. Order steps so parents appear before children; use `parent_step_index` when the parent is created in the same batch.
3. Present the exact JSON body and wait for **explicit user approval**; execution is via the inbox UI **Promote batch** (or equivalent) until a promote gateway tool exists.
4. After success, list returned `articles` ids and remind that publishing remains a separate UI step.

## Rules

- **Articles only** in this action (no FAQ rows in `steps`).
- Default `status` is **draft**; do not set **published** unless the user clearly requests it.
- On failure the server rolls back new creates; do not assume partial success.
- Preserve snake_case in all JSON.
