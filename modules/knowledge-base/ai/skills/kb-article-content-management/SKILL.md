---
name: kb-article-content-management
title: KB article content management
description: Create, read, update, archive, delete, and partially edit Knowledge Base articles through catalog-backed operations and routes.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# KB Article Content Management

Use this skill when the user wants to create, inspect, edit, publish, archive, delete, organize, or otherwise manage Knowledge Base articles.

## Tool Process

1. Start with `engenty_tools_search` using `moduleId: "knowledge-base"` and `kind: "tool"`.
2. Prefer registered article operations: `kb_articles_list`, `kb_article_get`, `kb_article_create`, and `kb_article_update`.
3. Use `engenty_tool_execute` before writes unless the input schema is already clear from the active skill and prior tool result.
4. Use first-class operations for versions (`kb_article_versions_list`, `kb_article_version_restore`), categories (`kb_categories_list`, `kb_category_create`), and attachments (`kb_article_attachments_list`, `kb_article_attachment_add`, `kb_article_attachment_delete`).

## Find Before Writing

- Use `kb_list` first when the target KB is ambiguous or the user asks to work across all KBs.
- Use `kb_articles_list` for title searches, status filters, directories, and parent article discovery.
- Use `knowledge_base_article_search` to detect semantic duplicates or related content before creating a new article. Pin `strategy: "lexical"` for exact title/keyword matches.
- **Use `kb_article_get` ONLY when you need the full article body.** Extract the `id` field from a prior `kb_articles_list` or search result and pass it as `article_id`. Do NOT call `kb_article_get` without an `article_id` parameter.
- **Never batch-fetch articles:** do not loop over list results and call `kb_article_get` for every item unless the user explicitly asks. The list summary fields (title, status, updated_at) are sufficient for most workflows.

## Reading Article Full Body (kb_article_get)

When `kb_articles_list` returns article summaries like:
```json
{
  "articles": [
    { "id": "abc123", "title": "Getting Started", "status": "published", "summary": "..." },
    { "id": "def456", "title": "API Guide", "status": "draft", "summary": "..." }
  ]
}
```

**To read the full body of one article**, extract its `id` and call:
```json
{
  "operationId": "kb_article_get",
  "input": { "article_id": "abc123" }
}
```

**Never call `kb_article_get` without `article_id`** — the parameter is required. If you don't have an article id, use `kb_articles_list` or `knowledge_base_article_search` first to find one.

## Create Articles

- Use `kb_article_create` for direct draft or published article creation.
- Default to `status: "draft"` unless the user explicitly asks to publish.
- Pass `kb_id` when known. If the target KB is unclear, ask first.
- Pass `parent_article_id` for nested pages; do not confuse KB slugs with article ids.
- Only claim an article exists after the tool result returns an `article_id` or equivalent created article payload.
- Prefer inbox capture and promote operations when provenance from raw material matters.

## Partial Article Edits

- Use `kb_article_update` with `article_id` and a non-empty `patch`.
- Keep patch keys in snake_case and send only fields that should change.
- Use partial patches for title, summary, content, status, tags, metadata, questions answered, parent article, sort order, and lock fields when supported by the described schema.
- For content edits, read the article first with `kb_article_get`, then patch the intended content field.
- Locked articles reject normal edits. To unlock, patch `locked_at: null` only when the user asked to unlock or clearly approved the edit.
- For bulk edits, ask one clear confirmation, then run one update per article id.

## Delete, Archive, Versions, Attachments

- Prefer archive/status changes over permanent delete when the user is unsure.
- Use `kb_article_versions_list` to fetch the history of article edits and `kb_article_version_restore` to restore the content to a past version.
- Use `kb_article_attachments_list` to retrieve filenames and sizes of documents linked to an article.
- Use `kb_article_attachment_add` to link an uploaded storage file reference to an article, and `kb_article_attachment_delete` to remove an attachment.

## Safety And Reporting

- Never silently overwrite published content. Summarize the intended patch before risky changes.
- Cite the article id and title in confirmations and final summaries.
- If an operation returns an error such as `Article is locked` or `Article not found`, stop and report the blocker with the article id.
