---
name: space-data
title: Write into Space Data and keep it updated
description: Create and update Artifacts (markdown pages mixed with other types), tables, and Apps in the active Space — find the existing item first, then write to the same id.
allowed-tools: artifact_write artifact_read table_write table_read app_build engenty_tools_search engenty_tool_execute show_artifact
---

# Space Data

Load this skill when the result should live in this Space's **Data** tab —
an Artifact (markdown page, html, table handle, app, file), a typed table, or
an App — and stay there as you refine it. Chat-only drafts, `/data` scratch,
and CSV `table` artifacts are the wrong surface.

Survey `current_space` first. If it is unresolved, stop: Space Data writes are
refused for this run. Never widen to the tenant.

## Find, then update

Create once. Every later run **updates the same item**. Do not mint a second
page, table, App, or Artifact because the previous id was not in this chat.

1. Look it up (table below).
2. If a clear match exists, read it and write the new version onto that id.
3. Create only when the lookup found nothing that owns this job.

| Surface | What it is | Find | Create | Update |
| --- | --- | --- | --- | --- |
| **Artifacts** | Space `ai.artifact` — markdown pages mixed with html, table CSV, app, file | `artifact_read` with no id (this Space + this chat) | `artifact_write` `{ type, title, content }` (`markdown` for a page) | `artifact_write` `{ artifact_id, expected_version, summary, content }` |
| **Tables** | Typed Space database, not a CSV dump | `artifact_read` (type `database`) then `table_read` | `table_write` `{ title, columns }` | `table_write` `{ table_id, insert / update / delete }` or `columns` to redefine |
| **Apps** | Runnable engenty App | reuse the **same `slug`** | `app_build` `{ name, slug, manifest, files }` | `app_build` with that slug and the **complete** file set |
| **Knowledge** | Knowledge-base library (`module_kb`) | `kb_articles_list` / `kb_article_get` | `kb_article_create` | `kb_article_update` with `article_id` |

Markdown pages and other artifact types share the **same Artifacts list**. Do
not create a second document because the first was html or markdown — find the
id, then write onto it.

`kb_article_*` **only** when Knowledge Base is mounted in this Space and the
job is that tree (categories, sources, FAQs, publish). Never use it to mint a
Space markdown page. Knowledge is a separate Data-tab root, and only appears
when the module is mounted.

Pages and other module records go through `engenty_tools_search` then
`engenty_tool_execute`. Artifact and table tools are native.

On `version_conflict`, `artifact_read` that id and retry with `current_version`.

## What belongs where

- **Markdown page** — lasting prose the Space treats as a document (how-tos,
  notes, briefs). `artifact_write` type `markdown`. Lives in Artifacts next to
  other formats. Not a spreadsheet, not an App, not a Knowledge Base article.
- **Table** — rows with a column definition (`number` / `date` / `duration` /
  `select` / `text` / `boolean`). Never `artifact_write type: "table"` for this.
- **App** — something a person runs (form, tracker, tool). `app_build` already
  pins the preview to the Space when `current_space` is resolved. Reuse `slug`.
- **Artifacts html/file** — a document or file handle to open beside chat. A
  Engenty run stores it on the Space by default; Copilot must pass
  `store_to: { scope_type: "space", scope_id: "<current space id>" }` or it
  stays on the thread. To keep it with an Engenty instead of Ablage, use
  `store_to: { scope_type: "agent", scope_id: "<agent id>" }`.
- **Knowledge** — only if the module is mounted and the work is the KB library.

## A table change can wake a routine

Every row write raises an event — from `table_write`, from an App's
`table.write`, from the Data tab alike: `ai.data_table.row.created`,
`ai.data_table.row.updated`, `ai.data_table.row.deleted`. The payload carries
`table_id` and `space_id` on top, plus `row_id` + `cells` (updated), `row_ids` +
`rows` (created) or `row_ids` (deleted). A routine that should run when a
table changes is an event routine on that name: `routines_create { kind:
"event", provider_id: "module-events", resource: "ai.data_table.row.updated",
event_filter: { table_id: "<id>" } }`. Always pin the `table_id`; without it the
routine wakes for every table in the tenant. No polling routine for this.

Load **artifacts-and-downloads** for CSV dumps, downloads, one-screen HTML, and
the artifact panel. Load **app-authoring** for a runnable App (`app_build`).
Load **kb-article-content-management** only when Knowledge Base is mounted and
the job is that tree.

## Do not

- Dump a Space database as CSV.
- Write deliverables under `/sandbox`, `/home`, or `/data` as a substitute for
  Data.
- Create a new item because the old one is not in this thread — list first.
- Call `show_artifact` immediately after a write; a new artifact opens itself.
- Create a KB article for a Space markdown page.
