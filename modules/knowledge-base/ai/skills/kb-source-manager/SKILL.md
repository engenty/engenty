---
name: kb-source-manager
title: KB Source and Integration Manager
description: Configure crawlers, sitemaps, manual ingestion, file uploads, run source indexing, and manage indexed items in the Knowledge Base.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# KB Source and Integration Manager

Use this skill when the user wants to configure crawler/indexing integrations, list document sources, run crawls/syncing, monitor ingestion runs, or list items indexed by a specific source.

## Ingestion Adapter Reference

Choose the correct `adapter_id` and pass its matching fields inside the `settings` object:

| adapter_id | When to use | Required settings keys |
|---|---|---|
| `url` | Fetch one or more specific URLs (not a crawl) | `url`: one URL per line (string) |
| `web_index` | Crawl a site by following links from an index page | `index_url`: start page URL (string); optional: `restrict_to_base_urls` (newline-separated URL prefixes), `limit` (default 10), `crawl_depth` (default 2) |
| `sitemap` | Ingest every URL listed in a sitemap.xml | `sitemap_url`: full URL to the sitemap (string) |
| `firecrawl_url` | Scrape a URL via Firecrawl API (requires server key) | `url`: target URL (string) |
| `manual` | Hand-authored text only — **never use for websites** | `title` (string), `body_markdown` (string) |
| `file_upload` | Already-uploaded Vault file | `storage_object_key`, `original_filename` |

**Decision rule:** If the user mentions a website, URL, or "crawl" → use `web_index`, `url`, or `sitemap`. Never use `manual` for web content.

---

## Operations Flow

1. **List existing sources:** Use `kb_sources_list` with `kb_id` to inspect current crawlers/sitemaps/uploads.
2. **Create a source:** Use `kb_source_create` — pick the adapter from the table above and pass the correct `settings`.
3. **Update configurations:** Use `kb_source_update` to modify schedulers, limits, ingestion configurations, or missing item strategies.
4. **Trigger crawl sync:** Use `kb_source_run` with `source_id` to execute ingestion.
5. **Monitor run details:** Use `kb_source_runs_list` to list execution logs, checks, and outcome errors.
6. **List indexed source items:** Use `kb_source_items_list` to list all URL keys and titles indexed by the crawler.

---

## Editing & Configuring Existing Sources (Complex Scenarios)

Use `kb_source_update` to patch a source integration using `source_id` and a `patch` object:

### 1. Ingestion Config (`ingest_config`)
Control how articles are structured, parsed, and updated when imported from the source:
- `agentic_instructions`: Provide custom guidelines for parsing HTML content (e.g., `"Ignore header, footer, and sidebar. Extract content only from the main article container with id 'content'."`).
- `category_id`: The UUID of the category folder where all new articles from this source should automatically be placed.
- `parent_article_id`: The UUID of a parent article to nest all ingested pages under.
- `template_mode` and `template_id`: Set `template_mode` to `"template"` and specify a `template_id` to apply custom template properties automatically.
- `content_mode`: Strategy for merging template structure with crawled content:
  - `"template_only"`: Use only template text.
  - `"template_before_full_content"`: Append template structure before the full crawled content.
  - `"template_before_summary"`: Append template structure before the generated summary.
  - `"full_content"`: Raw crawled page content.
  - `"summary"`: Crawled page content summarized.

### 2. Auto-Sync Schedule (`schedule`)
Set up recurring crawls/sync runs:
- `enabled`: Set to `true` to activate the schedule.
- `kind`: Choose `"interval"` or `"cron"`.
- `interval_minutes`: Number of minutes between runs (minimum `5`, e.g., `1440` for once a day).
- `cron_expression`: Standard 5-field cron string (e.g. `"0 2 * * *"` for daily at 2:00 AM).
- `timezone`: The target timezone string (e.g., `"Europe/Berlin"` or `"America/New_York"`).

### 3. Missing Item Ingestion Strategy (`missing_item_strategy`)
Decide what to do with previously ingested articles when they are missing from a new crawl:
- `"ignore"`: Keep the existing articles as they are.
- `"mark_missing"`: Mark article status/metadata as missing.
- `"set_draft"`: Change the article status to `"draft"`.
- `"delete"`: Automatically delete the missing articles.

---

## User Navigation Guide (Vite UI Layout)

To guide a user to perform these source updates manually via the browser:
1. Open the dev server page (e.g. `https://engenty.localhost/mdl/knowledge-base`).
2. Select the target **Knowledge Base** from the switcher or hub.
3. Click on the **Einstellungen** (Settings) tab in the header or sidebar.
4. Click on the **Quellen** (Sources) sub-tab to view all crawlers, sitemaps, and integrations.
5. Click on the specific Source item from the list to open the slider/edit dialog. Here you can configure:
   - Ingestion category and template bindings.
   - Custom Agentic Instructions for parsing.
   - Sync schedules and missing item strategies.
   - Crawl limits and start URLs.

---

## Best Practices

- Default to manual triggers (`trigger: "manual"`) or background runs when running ingestion tasks.
- Always confirm `adapter_id` + `settings` against the table above before calling `kb_source_create`.
- If a crawl fails, review `kb_source_runs_list` for recent logs to identify credentials or layout issues.
- Expose deleted sources (`kb_source_delete`) only after explicit verification with the user.
