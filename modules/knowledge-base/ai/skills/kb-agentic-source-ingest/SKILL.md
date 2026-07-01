---
name: kb-agentic-source-ingest
title: Agentic source ingestion
description: Autonomously transform indexed source items into structured KB articles, categories, and links according to user instructions.
allowed-tools: kb_list_items kb_get_item kb_find_article kb_list_articles kb_get_article kb_create_article kb_update_article kb_list_categories kb_create_category
---

# Agentic Source Ingestion

You are executing a one-shot ingestion run for a knowledge-base source. You receive:
- **Source items**: indexed pages/documents (title + URL; fetch full content with `kb_get_item`)
- **User instructions**: how to structure the output
- **KB context**: existing articles and categories
- **Default category id**: fallback placement when no content-type category fits

## Content types

Every article belongs to exactly one content type. Create a flat category for each type that has at least one article:

| Type | Category name | When to use |
|---|---|---|
| `concept` | Concepts | What X is, why it exists, how it works at a high level |
| `reference` | Reference | API, config options, schema definitions, exhaustive spec |
| `guide` | Guides | How to accomplish a specific goal (task-oriented) |
| `tutorial` | Tutorials | Step-by-step walkthrough — reader builds something |
| `integration` | Integrations | How this system works with another tool or service |
| `changelog` | Changelog | Version or release notes |
| `glossary` | Glossary | Term definitions |

## Principles

1. **Follow user instructions.** They define naming conventions, hierarchy, and any exceptions to defaults below.
2. **Synthesize, don't transcribe.** Rewrite source content as wiki-style prose. Strip navigation chrome, footers, sidebars, cookie banners, and repetitive boilerplate. The output article reads like an encyclopedia entry — not a copy of a web page.
3. **Article structure.** Every article must have:
   - A 1–2 sentence lead paragraph (what this is, why it matters)
   - H2 sections for major topics within the item
   - A `## See also` section (populated in Pass 3)
4. **Skip garbage items.** If a source item has fewer than 100 words of useful content after stripping boilerplate — or is a login page, 404 error, cookie consent page, or pure navigation page — skip it. Record it as "Skipped (garbage)" in the final summary.
5. **No duplicates.** For each item, call `kb_find_article` with `source_url` and `title` before creating. `kb_create_article` also auto-returns `existing: true` on URL collision — treat that as an update target.
6. **Draft by default.** All articles use `status: "draft"` unless instructions explicitly say to publish.
7. **Internal links use article IDs.** Use `[Title](article-id)` — where `article-id` is the UUID from the `link` field returned by every article tool. Never use slugs — they will 404.

## Workflow

### Pass 1 — Survey and categorise

1. Call `kb_list_items` to get all source items (paginate if `has_more: true`).
2. For each item, decide: which content type, and whether to skip (garbage filter). You do not need to fetch full content yet — title and URL are usually enough to classify.
3. Call `kb_list_categories` to find existing categories.
4. For each content type that has at least one non-skipped item: check if its category already exists. If not, call `kb_create_category` to create it.

### Pass 2 — Create / update articles

For each non-skipped item:
1. Call `kb_get_item` to fetch the full content.
2. Synthesize into wiki-style prose: write a lead paragraph, organize content into H2 sections, strip boilerplate. Do not just copy the source text.
3. Call `kb_find_article` with `source_url` and `title` — if found, plan an update instead of a create.
4. Call `kb_create_article` (or `kb_update_article` for an existing match) with:
   - `category_id`: the content-type category resolved in Pass 1
   - `original_document_url`: the item's source URL
   - `status: "draft"`
5. Save the returned `link` field — you will need it in Pass 3.

### Pass 3 — Cross-link

After all articles are created:
1. For each article, scan its content for titles or key concepts that match other newly-created articles.
2. Where a match exists, add a `[Title](id)` link inline or in the `## See also` section using the saved `link` values.
3. Call `kb_update_article` for each article that gained at least one new link.

## Output format

```
Ingestion complete.
- Items surveyed: N
- Skipped (garbage): K
- Created: A
- Updated: B
- Categories created: C
- Cross-links added: L

Articles:
[concept] Title — [Title](uuid)
[reference] Title — [Title](uuid)
...
```
