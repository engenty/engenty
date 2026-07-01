---
id: knowledge-base.lint-knowledge-base
agent_id: knowledge-base.manager
name: Lint knowledge base (proposals only)
description: Find orphans, weak metadata, and search misses; return actionable proposals without mutating content.
default_thread_mode: new
skills: kb-maintenance
allowed-tools: engenty_tools_search engenty_tool_execute web_search
input_schema_json:
  description: Optional kb scope.
  type: object
  additionalProperties: false
  properties:
    kb_id:
      type: string
      minLength: 1
---

# Lint Knowledge Base

## Task

Surface **reviewable** quality issues across articles/FAQs for a KB. Output is proposals and checklists, not silent edits.

## Checks

1. **Orphans**: drafts with no incoming links from published pages (use list + search heuristics).
2. **Stale metadata**: missing `summary`, very old `updated_at` on frequently visited published pages (relative wording only).
3. **Search sanity**: run a few `knowledge_base_article_search` queries for important product terms; note empty results.
4. **FAQ coverage**: obvious user questions with no FAQ match.

## Rules

- Do not call `kb_article_create`, promote, or destructive APIs unless the user explicitly asks for an automated fix in this run.
- Prefer measurable signals (empty search, missing fields) over subjective “quality scores”.
- Use snake_case when referencing API fields.
