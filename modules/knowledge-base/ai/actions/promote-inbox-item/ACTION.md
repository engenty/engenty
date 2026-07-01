---
id: knowledge-base.promote-inbox-item
agent_id: knowledge-base.manager
name: Promote inbox item to article or FAQ
description: Build a promote payload (draft article or FAQ) with provenance; only after explicit human approval.
default_thread_mode: new
skills: kb-ingest
allowed-tools: engenty_tools_search engenty_tool_execute web_search
input_schema_json:
  description: Inbox id and target kind.
  type: object
  additionalProperties: false
  properties:
    inbox_id:
      type: string
      minLength: 1
    target:
      type: string
      enum:
        - article
        - faq
---

# Promote Inbox Item

## Task

Produce a reviewed **`POST /api/kb/inbox/:id/promote`** body that compiles inbox content into a **draft** article or FAQ and creates **source reference** rows server-side.

For **several articles from one inbox** (parent + child pages in one commit), use **`POST /api/kb/inbox/:id/promote-batch`** instead — see catalog action **`knowledge-base.promote-inbox-batch`**. Single promote remains one article or one FAQ per request.

## Promote body (snake_case)

- `target`: `article` | `faq`
- `content_markdown`: compiled wiki markdown (may refine raw inbox text)
- `title` (article) or `question` (faq) when different from inbox title
- Optional `article_id` / `faq_id` to update an existing draft
- Optional `parent_article_id`, `tag_ids`, `status` (`draft` default)

### Hierarchy

- `parent_article_id` sets a **child page** under an existing article (same `kb_id`); the server rejects cycles.
- Use **`article_id`** when the user wants to **merge** inbox content into an existing **draft** article instead of creating a new row.

## Steps

1. Load inbox via `kb_inbox_get` or the catalog-discovered `GET /api/kb/inbox/:id` route.
2. Check for duplicates with `knowledge_base_article_search`, `kb_articles_list`, and `kb_faqs_list` through the catalog runner.
3. Present the exact JSON body for **`POST /api/kb/inbox/:id/promote`** and wait for explicit user approval; execution is via the inbox detail **Promote** UI (no agent promote tool yet).
4. After success, confirm promoted ids and remind that publishing is a separate UI step.

## Rules

- Default `status` is **draft**; do not set **published** unless the user clearly requests it and policy allows.
- Preserve traceability: rely on server `source_references` from promotion; cite inbox id in the summary.
- FAQ path requires a non-empty question (`question` or `title` in body per API schema).
