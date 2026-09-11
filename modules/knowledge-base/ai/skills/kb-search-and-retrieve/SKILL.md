---
name: kb-search-and-retrieve
title: KB search and retrieval
description: Find knowledge bases, search across one or all KBs, retrieve articles and FAQs, and answer with citations using catalog-backed operations.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# KB Search And Retrieve

Use this skill when answering questions from Knowledge Base content, finding pages or FAQs, comparing coverage across KBs, or deciding which KB id to use before a write.

## Tool Process

1. Start with `engenty_tools_search` using `moduleId: "knowledge-base"` and `kind: "tool"`.
2. Prefer registered `kb.*` operations. Use HTTP routes only when no registered operation covers the task.
3. Use `engenty_tool_execute` before unfamiliar writes or when the required input shape is unclear.
4. Use `engenty_tool_execute` only after choosing the exact operation id and input.

## Knowledge Base Selection

- A Space has exactly one Knowledge Base; `kb_list` returns it.
- Search and list operations in a Space-bound run resolve to that Knowledge Base; `kb_id` is optional there.
- List available KBs with `kb_list` when the user asks which KBs exist, says "all knowledge bases", needs a `kb_id`, or the current scope is ambiguous.
- If the UI context pins a specific `kb_id`, use that id for reads unless the user asks for another KB in this Space.
- If a write target is ambiguous, ask which KB to modify before running a write —
  with `requestDecision` (one choice per candidate KB) when your tools include
  it, in plain prose otherwise. Never invent a tool for this.

## Search Modes

- Use `knowledge_base_article_search` for natural-language questions and hybrid (vector + FTS) search over article chunks in current_space. Pass the current `kb_id` when known; do not fan out across every tenant KB from a Space-bound run.
- Pin `strategy: "lexical"` on `knowledge_base_article_search` for exact title / id / keyword lookups — that path skips the embedder entirely and runs BM25 / FTS only (cheap and quick).
- Use `kb_articles_list` with `search` and `search_fts: true` for paginated keyword listings, status filters, or title scans.
- Use both `knowledge_base_article_search` and `kb_articles_list` when the user needs high recall or when semantic and exact keywords may differ.
- Use `web_search` only when the answer needs external evidence or the KB evidence is insufficient. Say clearly when you used external evidence.

## Retrieval Operations

- **Use `kb_article_get` ONLY when you need the full article body.** Extract the `id` field from `knowledge_base_article_search` or `kb_articles_list` and pass it as `article_id`. The parameter is required—never call without it.
- **Never batch-fetch articles:** do not loop over search/list results to call `kb_article_get` for every item unless the user explicitly asks. The search/list summary fields are sufficient for answering most questions.
- Use `kb_articles_list` for directories, pagination, status filters, title checks, and broad article inventory.
- Use `kb_faqs_list` for FAQ lookup, FAQ inventory, and question-answer content.
- Use catalog-discovered HTTP `GET /api/kb/faqs/:id` when a specific FAQ body is required and no `kb.faq.get` operation is available.
- Use catalog-discovered HTTP `GET /api/kb/knowledge-bases` only when `kb_list` is unavailable.

## Answering Rules

- Cite article titles and ids. Cite FAQ ids when FAQs are used.
- If evidence is insufficient, say so and suggest the next retrieval step instead of guessing.
- Refer to "full-text search" in user-facing explanations; do not mention BM25.
- Do not expose UUID ids - you are talking to a human beeing. Not a robot.
- Use bold, italic, links if needed
- Link records with the `url` field of a search hit or the `link` field of a list/get row, verbatim. These are path-only URLs inside the active Space (`/s/<space_key>/kb/…`); never build one from ids or slugs and never prepend a host.
