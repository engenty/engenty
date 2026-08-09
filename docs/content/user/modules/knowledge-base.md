---
title: Knowledge base
description: Articles, FAQs, categories and ingest sources with hybrid search — and the agent operations the copilot uses.
---

# Knowledge base

Your written knowledge, organized into **knowledge bases**, each with articles,
FAQs and categories. Articles keep a version history you can restore from.

Two things make it useful to agents rather than merely searchable:

- **Sources** ingest content from elsewhere on a schedule, so the KB keeps up
  without manual copying.
- The **capture inbox** is a staging lane: rough material lands there, gets
  triaged, and is promoted into a proper article or FAQ.

Search is hybrid — wording and meaning — with a graph-aware mode for questions
that span several articles.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

### Articles and FAQs

| Operation | | What it does |
| --- | --- | --- |
| `kb_list` | Reads | List knowledge bases |
| `kb_articles_list` | Reads | List articles |
| `kb_article_get` | Reads | Get an article |
| `kb_article_versions_list` | Reads | List an article's version history |
| `kb_article_attachments_list` | Reads | List attachments on an article |
| `kb_faqs_list` | Reads | List FAQs |
| `kb_categories_list` | Reads | List categories |
| `kb_category_get` | Reads | Get a category |
| `knowledge_base_article_search` | Reads | Search articles (wording + meaning) |
| `kb_graph_rag_search` | Reads | Graph-aware search across linked knowledge |
| `kb_article_create` | Writes | Create an article draft |
| `kb_article_update` | Writes | Patch an article |
| `kb_article_version_restore` | Writes | Restore an article to a past version |
| `kb_article_attachment_add` | Writes | Link an attachment to an article |
| `kb_article_attachment_delete` | Writes | Remove an attachment link |
| `kb_faq_create` | Writes | Create a FAQ entry |
| `kb_faq_update` | Writes | Patch a FAQ entry |
| `kb_faq_delete` | Writes | Delete a FAQ entry |
| `kb_category_create` | Writes | Create a category |
| `kb_category_update` | Writes | Update a category |
| `kb_category_delete` | Writes | Delete a category |

### Capture inbox and sources

| Operation | | What it does |
| --- | --- | --- |
| `kb_inbox_get` | Reads | Get a capture item |
| `kb_sources_list` | Reads | List sources |
| `kb_source_items_list` | Reads | List indexed items for a source |
| `kb_source_runs_list` | Reads | List runs for a source |
| `kb_inbox_create` | Writes | Create a capture item |
| `kb_inbox_update` | Writes | Patch a capture item |
| `kb_inbox_delete` | Writes | Delete a capture item |
| `kb_inbox_fetch_source` | Writes | Ingest content from a capture item's URL |
| `kb_inbox_promote` | Writes | Promote a capture item into an article or FAQ |
| `kb_inbox_promote_batch` | Writes | Promote one item into several nested articles |
| `kb_source_create` | Writes | Create a source integration |
| `kb_source_update` | Writes | Update a source integration |
| `kb_source_delete` | Writes | Delete a source integration |
| `kb_source_run` | Writes | Trigger a source run |
