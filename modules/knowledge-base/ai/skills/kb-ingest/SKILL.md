---
name: kb-ingest
title: KB ingest workflow
description: Karpathy-style capture -> triage -> human review -> promote to draft article/FAQ with provenance.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# KB Ingest

Use this skill when capturing raw sources, triaging inbox rows, or preparing promotion to the compiled wiki.

## Principles

- **Inbox is immutable-ish capture**; compiled pages are articles/FAQs.
- **Human gate** before publish: default to **draft** and UI review.
- **Provenance**: rely on promotion APIs to attach `source_references`; cite inbox ids in summaries.

## Workflow

1. Use `engenty_tools_search` with `moduleId: "knowledge-base"` to find the inbox and ingestion operations.
2. Capture content using `kb_inbox_create` with raw markdown, text, or a source URL.
3. If the captured item has a URL but lacks raw content, fetch the content using `kb_inbox_fetch_source`.
4. Triage with `knowledge_base_article_search`, `kb_articles_list`, and article reads; write `triage_summary` / `triage_metadata`; patch the inbox row via `kb_inbox_update` only when approved.
5. Promote with `kb_inbox_promote` (or `kb_inbox_promote_batch` for hierarchical multi-article structures) only after explicit confirmation.
6. For placement and deduping: use **`knowledge_base_article_search`** with default hybrid mode for **semantic** matches, and the same op with **`strategy: "lexical"`** (or `kb_articles_list` with `search` plus **`search_fts: true`**) for **keyword / full-text** matches.

## Long documents

Prefer sectioned notes in `metadata` or split captures over one giant blob when content is very long.