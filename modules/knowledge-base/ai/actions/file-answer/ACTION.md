---
id: knowledge-base.file-answer
agent_id: knowledge-base.manager
name: File chat answer to inbox
description: Turn a useful assistant answer into an inbox capture for human review before wiki promotion.
default_thread_mode: new
skills: kb-search-and-retrieve
allowed-tools: engenty_tools_search engenty_tool_execute web_search
input_schema_json:
  description: Optional kb_id and title for the capture.
  type: object
  additionalProperties: false
  properties:
    kb_id:
      type: string
      minLength: 1
    title:
      type: string
      minLength: 1
---

# File Answer To Inbox

## Task

Persist a high-value chat reply as **`source_type: chat`** (or `paste`) inbox content so editors can triage and later promote.

## Steps

1. Resolve `kb_id` if missing.
2. Craft a concise `title` (what future readers will see in the inbox list).
3. Use `engenty_tool_execute` with `kb_inbox_create` when available, or the catalog-discovered inbox create route, with `raw_markdown` containing the answer, citations to article ids/titles used, and `metadata` noting origin (e.g. `{ "origin": "copilot", "session_hint": "..." }` without secrets).
4. Confirm inbox id and suggested next step (triage action).

## Rules

- Do not auto-promote to published articles.
- Strip secrets, tokens, and personal data from filed content.
- Use snake_case JSON for the API.
