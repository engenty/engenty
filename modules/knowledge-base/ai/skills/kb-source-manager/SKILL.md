---
name: kb-source-manager
title: KB Source and Integration Manager
description: Configure crawlers, sitemaps, manual ingestion, file uploads, run source syncs, verify indexed items, and turn them into articles via kb_source_ingest.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# KB Source and Integration Manager

Use this skill when the user wants to build a Knowledge Base from an external source (a website, a law, product docs, files), configure crawler/indexing integrations, run syncs, monitor runs, or turn synced items into articles.

## Spaces

- Sources belong to a Knowledge Base in **current_space**. `kb_list` returns the Space's one Knowledge Base.

## The two-phase model (read this first)

Building a KB from a source is **two separate phases**:

1. **Sync** — `kb_source_run` indexes the source and fetches the raw items (pages/documents). It creates **no articles**. After it finishes you have source items, nothing more.
2. **Ingest** — `kb_source_ingest` turns the synced items into KB articles. Two independent choices:
   - **`strategy` — how many articles**: `per_entry` (one article per synced item), `per_source` (one article, all items merged), or `agentic` (dispatches an agent that reads the items and authors a structured, cross-linked wiki following the authoring brief in `instructions` / `ingest_config.agentic_instructions`; returns `{ task_id, async_run: true }` and completes asynchronously as a task).
   - **Content switches — what goes in each article**, all combinable and all defaulting off except the full text:
     - `include_full_content` (default true unless `include_summary` is set): the source text verbatim.
     - `include_summary`: a generated summary, into the article's summary field and as a body section.
     - `include_questions`: a "Questions answered" section with answers and citation links, plus `questions_answered`.
     - `attach_original`: link the entry's original document/URL on the article.
     - `split_long_articles`: cut oversized bodies into sub-pages under a generated index page — with `per_entry` at the document's own headings, with `per_source` one sub-page per entry. Needs `include_full_content`.

Running `kb_source_run` alone never fills the KB. Skipping the source and hand-writing articles from your own knowledge is a failure, not a fallback — the whole point of a source is that articles are grounded in fetched content.

## Adapter decision table

Choose `adapter_id` by what the user actually wants covered:

| User intent | adapter_id | Required `settings` |
|---|---|---|
| "The whole site / the whole law / all the docs" — an index, hub, register, or table-of-contents page | `web_index` | `index_url` (start page). Set `limit` explicitly — **the default is only 10 pages**; raise it to cover the material (max 500). Optional: `crawl_depth` (default 2, max 10), `restrict_to_base_urls` (newline-separated URL prefixes to stay on-topic) |
| A known, finite list of specific pages | `url` | `url`: one URL per line. Each line is fetched once — **no link-following, no crawling** |
| A sitemap.xml exists | `sitemap` | `sitemap_url` |
| JS-heavy page needing a scraping API (server key required) | `firecrawl_url` | `url` |
| Hand-authored text — **never websites** | `manual` | `title`, `body_markdown` |
| Already-uploaded Vault file | `file_upload` | `storage_object_key`, `original_filename` |

**The classic mistake:** registering an index/register page (e.g. a legal register's table of contents) as a `url` source. That fetches exactly **one page** — the index itself — and the actual content never arrives. An index page is a *starting point for a crawl*: use `web_index` with `index_url`, a `limit` sized to the material, and `restrict_to_base_urls`.

## Standard workflow

1. **List existing sources:** `kb_sources_list` with `kb_id`.
2. **Create the source:** `kb_source_create` — pick the adapter from the table. Configure ingestion in the same call via `ingest_config`:
   - `agentic_instructions`: the **authoring brief** for agentic ingestion — describe the wiki you want built from the items: topic, structure, granularity, grouping (e.g. "Baue ein Wiki zur Wiener Bauordnung: ein Artikel pro Paragraph, gruppiert nach Abschnitten"). This is NOT an HTML-parsing hint.
   - `category_id`: folder where ingested articles land.
   - `parent_article_id`: parent article to nest under.
   - `template_id` / `template_mode`: template binding for generated articles.
   - the content switches above (`include_full_content`, `include_summary`, `include_questions`, `attach_original`, `split_long_articles`) — stored as the source's ingest defaults, and reused by every later run unless a call overrides them.
   You can also seed `initial_index_entries` / `ignored_item_keys` from an index preview, and patch everything later with `kb_source_update`.
3. **Sync:** `kb_source_run` with `source_id` (use `background: true` for large crawls; check progress with `kb_source_runs_list`).
4. **VERIFY the sync — mandatory:** `kb_source_items_list` with `source_id`. Sanity-check the item count against the goal: **1–2 items for "a whole law" or "the whole site" means the source is misconfigured** (wrong adapter, `limit` left at 10, wrong `index_url`). Fix the source (`kb_source_update`) and re-run before ingesting. Never proceed — and never report success — on an implausible item set.
5. **Plan the wiki (agentic only):** when the user wants an agentic wiki but has not said how it should be structured, call `kb_source_analyze` first and show them the extracted `concepts`, the proposed `pages` and the drafted `suggested_instructions`. Do not silently adopt the draft — it is a proposal for them to adjust, and passing it through unseen throws away the one chance they have to steer the structure.
6. **Ingest:** `kb_source_ingest` with `source_id`, a `strategy`, and the content switches the user asked for. For `agentic`, pass `instructions` (or rely on `ingest_config.agentic_instructions`) and report the returned `task_id` — the articles arrive asynchronously. A long document (a law, a manual) is a case for `split_long_articles`: one index page plus a sub-page per chapter beats one unreadable page.
7. **Confirm the outcome:** for sync strategies check the returned counts; for agentic runs the task reports its result as a task comment. Only claim completion for what you verified.

## Operations

| Operation | Purpose |
|---|---|
| `kb_sources_list` | List configured sources for a KB |
| `kb_source_create` | Create a source (adapter + settings + optional `ingest_config`, `initial_index_entries`, `ignored_item_keys`) |
| `kb_source_update` | Patch settings, schedule, `ingest_config`, `missing_item_strategy` |
| `kb_source_run` | **Phase 1 — sync only**: index the source and fetch raw items. Creates no articles |
| `kb_source_items_list` | List the items a source has indexed — the verification step between sync and ingest |
| `kb_source_analyze` | Extract the concepts the synced items establish, propose one page per concept, and draft the agentic authoring brief. Read-only |
| `POST /api/kb/sources/:id/suggest-template` | Propose one article template — section skeleton plus repeating typed fields — from a sample of the synced items. Read-only; creating it is a separate `/api/kb/templates` call |
| `kb_source_ingest` | **Phase 2**: turn synced items into articles (`per_entry` / `per_source` / `agentic`, plus the content switches) |
| `kb_source_runs_list` | Recent sync executions and their outcomes |
| `kb_source_delete` | Remove a source and stop scheduled runs |

## Editing existing sources (`kb_source_update`)

Patch via `source_id` + `patch`:

### 1. Ingestion config (`ingest_config`)
- `agentic_instructions`: the authoring brief for agentic ingestion (what wiki/structure to build from the items — see above; max 5000 chars).
- `category_id`, `parent_article_id`: default placement for ingested articles.
- `template_mode` + `template_id`: set `template_mode: "template"` with a `template_id` to apply template properties.
- `include_full_content`, `include_summary`, `include_questions`, `attach_original`, `split_long_articles`: the content switches, stored as this source's ingest defaults. A bound template's structure is always applied on top; switching everything off leaves the template structure as the whole body.

### 2. Auto-sync schedule (`schedule`)
- `enabled`: `true` to activate.
- `kind`: `"interval"` or `"cron"`.
- `interval_minutes` (min 5, e.g. `1440` = daily) or `cron_expression` (e.g. `"0 2 * * *"`).
- `timezone`: IANA zone (e.g. `"Europe/Vienna"`). Note: a scheduled run only **syncs**; ingest what it fetched separately.

### 3. Missing item strategy (`missing_item_strategy`)
What happens to previously ingested articles missing from a new sync: `"ignore"`, `"mark_missing"`, `"set_draft"`, or `"delete"`.

## Best practices

- Size `web_index` crawls deliberately: `limit` defaults to 10 — for "the whole X" estimate the page count and set `limit` (and `crawl_depth`) accordingly, with `restrict_to_base_urls` to keep the crawl on-topic.
- Configure `ingest_config` **before** ingesting so agentic runs have their brief and articles land in the right place.
- Always run the verify step (`kb_source_items_list`) between sync and ingest; treat an implausibly small item set as a source bug, not as license to write articles yourself.
- If a sync fails, review `kb_source_runs_list` for the error before retrying.
- `kb_source_delete` only after explicit confirmation with the user.
