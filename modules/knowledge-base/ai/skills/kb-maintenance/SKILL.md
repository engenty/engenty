---
name: kb-maintenance
title: KB maintenance and lint
description: Orphan/stale checks, search sanity, and contradiction hints as proposals, not silent rewrites.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# KB Maintenance

Use this skill when the user asks for hygiene, lint, audits, or “what is broken/outdated” in the knowledge base.

## What to do

1. Sample lists with `kb_articles_list` and `kb_faqs_list`, use `knowledge_base_article_search` (default hybrid mode) for semantic recall, and `knowledge_base_article_search` with **`strategy: "lexical"`** (or `kb_articles_list` with `search` and **`search_fts: true`**) where keyword coverage matters.
2. Flag **orphans**, **missing summaries**, **stale updated_at** on critical pages, and **empty search** for important terms.
3. When contradictions are suspected between two articles, cite both ids and the conflicting claims—do not auto-edit.

## Follow-ups (later)

Graph edges (`uses`, `supersedes`, …) and reciprocal-rank fusion across FTS + vectors + graph are **not required** for first-line maintenance; mention them only as optional scale-ups.