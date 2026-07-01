---
id: knowledge-base.triage-inbox
agent_id: knowledge-base.manager
name: Triage KB inbox item
description: Summarize an inbox item, suggest placement, tags, and duplicates; output a PATCH proposal for human review.
default_thread_mode: new
skills: kb-ingest
allowed-tools: engenty_tools_search engenty_tool_execute web_search
input_schema_json:
  description: Target inbox item id.
  type: object
  additionalProperties: false
  properties:
    inbox_id:
      type: string
      minLength: 1
---

# Triage Inbox Item

## Task

Turn a raw inbox row into structured triage notes and safe edit proposals.

## Steps

1. Load the inbox row with `kb_inbox_get` or the catalog-discovered `GET /api/kb/inbox/:id` route.
2. Use `knowledge_base_article_search`, `kb_articles_list`, and `kb_article_get` through the catalog runner to find similar pages and a likely parent article.
3. Draft `triage_summary` and optional `triage_metadata` (entities, suggested tags) as **review notes**, not automatic writes unless the user explicitly asked to apply PATCH.
4. If duplicates are likely, list candidate article ids and titles with similarity rationale.
5. When the user confirms, run `kb_inbox_update` or the catalog-discovered inbox patch route with `status: triaged` and the approved fields in `patch`.

## `triage_metadata` (stable UI contract, version 1)

When you populate `triage_metadata` on PATCH proposals or review notes, prefer this JSON shape so the inbox detail **Suggestions** panel can render it read-only:

```json
{
  "version": 1,
  "suggested_tags": [{ "id": "uuid-or-slug", "label": "Human label" }],
  "suggested_parent_article_id": "uuid-or-null",
  "duplicate_article_ids": [
    { "id": "uuid", "title": "Article title", "rationale": "Why it may duplicate" }
  ],
  "notes": "Short free-text notes for the editor."
}
```

- Omit unknown keys; keep `version` literal `1` when using this shape.
- All ids are strings; empty arrays may be omitted.

## `triage_metadata` version 2 (multi-page plan, read-only in UI)

Use **`version: 2`** when one capture should become **several** wiki pages with a stable order. The inbox detail UI renders `promote_steps` as a **numbered checklist** only; it does **not** auto-promote. Materializing drafts still requires **human** use of **Promote all (draft)** or the **`promote-batch`** API after approval.

```json
{
  "version": 2,
  "placement": {
    "parent_article_id": "uuid-or-null"
  },
  "primary_step_index": 0,
  "promote_steps": [
    {
      "role": "parent",
      "title": "Parent page title",
      "content_markdown": "# …"
    },
    {
      "role": "child",
      "title": "Child page",
      "parent_step_index": 0,
      "content_markdown": "## …"
    }
  ],
  "notes": "Optional editor notes."
}
```

- `placement` supplies defaults for steps that omit the outer parent (steps still use `parent_step_index` when the parent is created earlier in the same batch).
- After the **parent** exists in the KB, later triage runs can use `parent_article_id` instead of `parent_step_index`.
- You may keep v1 fields (`suggested_tags`, `duplicate_article_ids`, etc.) alongside v2 for the same panel.

## Rules

- Never promote (`POST .../promote` or `…/promote-batch`) without explicit user confirmation in the same session.
- Prefer **`knowledge_base_article_search`** (default hybrid) for semantic similarity, the same op with **`strategy: "lexical"`** (or **`kb_articles_list`** with `search_fts: true`) for keyword/title matches, and **`kb_article_get`** for full bodies; avoid speculative rewrites of long raw inbox text without reading similar pages first.
- Use snake_case in all API JSON.
