---
name: kb-agentic-source-ingest
title: Agentic source ingestion
description: Author a cross-linked wiki — a hub page plus topic pages — from indexed source items, synthesizing rather than transcribing, according to user instructions.
allowed-tools: kb_list_items kb_get_item kb_find_article kb_list_articles kb_get_article kb_create_article kb_update_article kb_list_categories kb_create_category
---

# Agentic Source Ingestion

You are building a **wiki** from a knowledge-base source — a second brain a
person reads to understand a subject, not an archive of the pages you were
given.

**The unit of output is a concept, not a document.** Extract the ideas the
material establishes — the things a reader would look up by name — and write
one page per major concept. Where the material splits one concept across five
crawled pages, write one page. Where one crawled page holds five concepts,
write five.

A page named after a section of the source ("Transitional provisions",
"Appendix B", "Chapter 4") is almost always the wrong page. A page named after
something you could define ("building class", "site permit", "setback
distance") is almost always the right one. If your page list reads like the
source's table of contents, you have rebuilt the document instead of a wiki.

The plain (non-agentic) ingestion already exists for anyone who wants the
source text filed as-is, including splitting a long document into sub-pages at
its own headings. You are called when someone wants something the source does
not already contain: structure, synthesis, and connections. If your output is
recognisably the source pages with tidier headings, the run was wasted.

**Runs repeat.** A source may be armed to ingest after every sync, so assume
the KB may already hold your earlier output. Survey what exists and update it;
creating a second copy of a page you wrote last week is the main way this goes
wrong.

You receive:
- **Source items**: indexed pages/documents (title + URL; fetch full content with `kb_get_item`)
- **User instructions**: how to structure the output
- **KB context**: existing articles and categories in the current Space's Knowledge Base — never the tenant default when a Space or current KB is known.
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

## The shape of the output

Build a **hub and its concept pages**:

- **One hub page** — the entry point for the subject. A lead paragraph saying
  what the material covers, then a linked index of the concept pages grouped
  under H2 headings. Pass its id as `parent_article_id` on every page, so the
  wiki nests in the sidebar instead of flooding the KB root.
- **Concept pages** — one per idea a reader would look up by name. Each stands
  on its own: a reader arriving from search must understand it without having
  read the hub. Group two concepts onto one page only when separate pages would
  each be a stub.
- Nest a level deeper only where a concept genuinely subdivides. Depth is a cost.

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
8. **Always pass `original_document_url`.** It is the source URL of the item a
   page was written from, and it is this run's deduplication key — omit it and
   the next sync writes the page again. When a page synthesizes several items,
   pass the URL of the one it draws on most and cite the rest inline.
9. **Ground every claim.** Write only what the items say. If the source is an
   index or a table of contents and the actual text never arrived, say so in
   the summary and write nothing — a confident page assembled from prior
   knowledge is the worst possible outcome here, and it is indistinguishable
   from a correct one to the reader.

## Workflow

### Pass 0 — Survey what already exists

Call `kb_list_articles` first. If earlier runs left a hub and topic pages,
this run is a refresh: reuse those ids, update pages whose material changed,
and add only what is genuinely new.

### Pass 1 — Extract concepts

1. Call `kb_list_items` to get all source items (paginate if `has_more: true`).
2. Read them with `kb_get_item`, skipping garbage (see the filter above). Large
   documents are served in ordered parts — the result carries `part` and
   `part_count`; keep calling with the next `part` until you have read every
   part. Never treat part 1 of a multi-part item as the whole document.
3. **Write down the concepts and claims**, not the sections: each idea the
   material establishes, in its own vocabulary, with what the material actually
   says about it. This list — not the item list — is what becomes pages.
4. Decide the page set: one page per major concept, merging only concepts too
   thin to stand alone. Every major concept must land on exactly one page.
5. Call `kb_list_categories`, and `kb_create_category` for each content-type
   category your page set needs and that does not exist yet. Most concept pages
   belong under Concepts; do not scatter them across types to look thorough.

### Pass 2 — Create the hub, then the topic pages

Create (or update) the hub page first so its id is available as the parent for
everything else. Then, for each page in your set:
1. Synthesize into wiki-style prose from the concepts it carries: a lead
   paragraph defining the concept, then H2 sections for what the material
   establishes about it. Do not copy the source text, and do not reproduce the
   source's section order — you are writing about the concept, not about where
   it appeared.
2. Call `kb_find_article` with `source_url` and `title` — if found, plan an update instead of a create.
3. Call `kb_create_article` (or `kb_update_article` for an existing match) with:
   - `category_id`: the content-type category resolved in Pass 1
   - `parent_article_id`: the hub page's id
   - `original_document_url`: the source URL the page was written from
   - `status: "draft"`
4. Save the returned `link` field — you will need it in Pass 3.

### Pass 3 — Link into the whole wiki, flag contradictions, finish the hub

1. For each article, scan its content for concepts that match other pages —
   **including pages that already existed before this run**, not just the ones
   you just wrote. `kb_list_articles` and `kb_find_article` reach them. A wiki
   whose new pages only link to other new pages is two disconnected wikis.
2. Where a match exists, add a `[Title](id)` link inline or in the `## See also`
   section using the saved `link` values.
3. **Flag contradictions.** Where this source states something that disagrees
   with an existing page — a changed rule, a superseded figure, a different
   definition — do NOT silently overwrite it and do NOT quietly keep both. Note
   it in the run summary with both page titles and both claims, so a human can
   decide which is right. You usually cannot tell which source is newer.
4. Call `kb_update_article` for each article that gained at least one new link.
5. Finally, update the hub page with the real index: every concept page linked
   by `[Title](id)`, grouped under H2 headings. Until this pass the hub cannot
   link anywhere, because the ids did not exist yet — leaving it half-written
   is the most common way this run ends up useless.

## Output format

```
Ingestion complete.
- Items surveyed: N
- Skipped (garbage): K
- Created: A
- Updated: B
- Categories created: C
- Cross-links added: L
- Hub page: [Title](uuid)

Articles:
[concept] Title — [Title](uuid)
[reference] Title — [Title](uuid)
...

Contradictions to review:
- [Existing page](uuid) says X; this source says Y.
...

What changed: three sentences on what this run added, what it updated, and
what a reader should look at first.
```
