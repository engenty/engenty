---

id: knowledge-base.capture-source
agent_id: knowledge-base.manager
name: Capture raw material (inbox API)
description: Prepare or execute capture of raw text, URL notes, or pasted markdown via POST /api/kb/inbox for triage and promote (UI surfaces sources under Sources / Daten-Quellen).
default_thread_mode: new
skills: kb-ingest
allowed-tools: engenty_tools_search engenty_tool_execute web_search
input_schema_json:
  description: Optional kb_id when not implied by context.
  type: object
  additionalProperties: false
  properties:
    kb_id:
      type: string
      minLength: 1

---

# Capture raw material (`POST /api/kb/inbox`)

## Task

Create a durable **inbox** record (`module_kb.inbox_items`) so raw material is preserved before wiki compilation. Editors work from **Sources / Daten-Quellen** in the UI; the inbox API is still the **capture** contract for agents (same rows the Sources UI lists for triage/promote).

## Steps

1. Resolve `kb_id` from user context, defaults, or `kb_list` through the catalog runner.
2. Use `engenty_tool_execute` with `kb_inbox_create` when available, or the catalog-discovered `POST /api/kb/inbox` route, with **snake_case**: `kb_id`, `title`, `source_type` (`paste` | `url` | `file` | `chat` | `other`), optional `source_url`, `raw_markdown` / `raw_text`, optional `metadata`.
3. Prefer `raw_markdown` when the payload is already markdown; otherwise `raw_text`.
4. After a successful capture, summarize what was stored and the inbox id; do not promote to an article in this action.

## Rules

- Do not publish or set article/FAQ status to published from this action.
- If the user only has a URL without a fetched body, store the URL and title first; after the row exists, you may run **`POST /api/kb/inbox/:id/fetch-source`** (optional `{ "force": true }`) to pull remote content when the user wants that in the same session—otherwise triage can assume the body is filled later in the UI.
- Use only allowed tools.