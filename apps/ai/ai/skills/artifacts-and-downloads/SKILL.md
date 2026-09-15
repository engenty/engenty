---
name: artifacts-and-downloads
description: Publish written artifacts and durable generated files on the right deliverable surface.
license: MIT
author: Engenty; HTML-vs-App split from Anthropic web-artifacts-builder (scope only)
metadata:
  engenty:
    origin: anthropics/skills skills/web-artifacts-builder (scope only); anthropics/skills skills/frontend-design (anti-slop)
---

# Artifacts and downloads

Use an **artifact** for authored output the user should read, review, or hand
off. Use **Files** for durable file deliverables. Both are real product
surfaces; workspace mounts are run context and working files. Never substitute
a scratch path, signed URL, or raw storage key in chat.

Space uploads the user already stored (Data → Files) live at `/data/Files`.
List and read that tree; do not republish them through `vault_files`. Tenant
Speicher (`vault_files`) is for deliverables *you* generate. `/data` otherwise
is mounted module records.

## Pick a surface (HTML vs App vs file)

| Need | Surface | How |
| --- | --- | --- |
| Prose, a one-screen visual, a simple interactive page | Artifact `markdown` or `html` | `artifact_write` inline `content` |
| A tool with several views, shared state, or Engenty operations | Tenant **App** | Load **app-authoring**; call `app_build` |
| A view over Space data that must stay current — a board, a dashboard, a queue | Tenant **App** over a Space table (`engenty.tables`) | Load **app-authoring**, "Space data" |
| A poster, print, or visual art object | PNG/PDF file, or HTML with inlined fonts | Load **canvas-design** |
| Spreadsheet, PDF, deck, image, archive | Files + artifact handle | Write to tenant storage, then `artifact_write { file }` |
| A Space page, database, or App that should stay and be updated | Space Data | Load **space-data** |

**An `html` artifact is a static document.** No bridge, no data, no
credentials: it cannot read a Space table or an operation — not live, not even
once. A page that shows the state of anything is an App; pushing the state into
the HTML by hand is a snapshot that is wrong on the next write.

**HTML artifacts stay one self-contained document.** Inline CSS and JS. No CDN,
no `init-artifact.sh`, no Parcel bundle, no shadcn tarball — Engenty does not
run those scripts. If the page needs components, routing, or a backend, stop
and load **app-authoring**.

Custom typefaces only as `@font-face` with `data:` URLs (`font-src data:`). A
link to `/skills/…/*.ttf` or a font CDN will not load. Load **canvas-design**
when the piece needs the bundled faces. Otherwise use system fonts.

For HTML, avoid the templated look: purple gradients, Inter-on-everything,
uniform giant rounding, everything centered. Pick type and color from the
subject.

## Written content

For a document you author — prose, rich output, tabular data — pass the content inline.

| Call | Shape |
| --- | --- |
| `artifact_write` (create) | `{ type: "markdown" \| "html" \| "table", title, content }` → `{ artifact_id, version }` |
| `table_write` (create) | `{ title, columns }` → `{ table_id, artifact_id }` — a Space **database** (not a CSV `table` artifact). Lands in Ablage. |
| `table_write` (rows) | `{ table_id, insert: [{ col: value }] }` — `update` / `delete` the same way. |
| `table_read` | `{ table_id }` — definition + rows |
| `artifact_write` (update) | `{ artifact_id, content, expected_version, summary }` — on `version_conflict`, `artifact_read` then retry with `current_version` |
| `artifact_write` (promote) | add `store_to: { scope_type, scope_id }` to keep it on a task, project, space, or Engenty (`scope_type: "agent"`) |
| `artifact_read` | `{ artifact_id }` reads one; no id lists this chat's artifacts |
| `show_artifact` | Re-open one that is no longer in view |

Do **not** dump a Space database as `artifact_write type: "table"` (CSV). Give each column a type and a format:

| Type | `format` | Stored value |
| --- | --- | --- |
| `text` | — | string |
| `boolean` | — | true / false |
| `number` | `style`: `integer` \| `decimal` \| `percent` \| `currency` (+ ISO `currency`, optional `fractionDigits`, `grouping`) | number. Percent is a ratio (`0.15` → 15%). Currency is major units (`12.5` EUR). |
| `date` | `kind`: `date` \| `datetime` \| `time`. Optional `dateStyle`, `timePrecision`: `hours` \| `minutes` \| `seconds`. `hours` = clock hour only (`14` or `14:30` → `14:00`). | `YYYY-MM-DD`, ISO timestamp, or `HH:mm` / `HH:00` |
| `duration` | `inputUnit` (what the writer types) + `display` (`hms` \| `hours` \| `minutes` \| `decimal-hours` \| `iso`) | milliseconds. A number is interpreted in `inputUnit`. |
| `select` | `options: [{id,label}]`, **`allowCustom`**, optional `multiple` | option id, or a custom string when `allowCustom` is true |

Example create:

```
table_write {
  title: "Shifts",
  columns: [
    { "id": "who", "name": "Who", "type": "text", "required": true },
    { "id": "rate", "name": "Rate", "type": "number", "format": { "style": "currency", "currency": "EUR" } },
    { "id": "share", "name": "Share", "type": "number", "format": { "style": "percent" } },
    { "id": "day", "name": "Day", "type": "date", "format": { "kind": "date" } },
    { "id": "opens", "name": "Opens", "type": "date", "format": { "kind": "time", "timePrecision": "hours" } },
    { "id": "took", "name": "Took", "type": "duration", "format": { "inputUnit": "hours", "display": "hms" } },
    { "id": "status", "name": "Status", "type": "select", "format": { "allowCustom": true, "options": [{ "id": "open", "label": "Open" }, { "id": "done", "label": "Done" }] } }
  ]
}
```

Use `table` for CSV or a JSON array of rows — not a markdown table pasted into prose.

A Space **database**, page, App, or Ablage document that should stay in this
Space — and be updated later — is **space-data**, not this skill.

## Generated files

For a generated spreadsheet, PDF, image, archive, or other binary, publish it
to durable tenant Files/storage, then register that **storage key** instead of
inline content:

```
artifact_write { title: "Q3 numbers", file: { key: "<tenant storage key returned by the file write>" } }
```

The type is implied. The panel previews what it can and always offers a download, so you never paste a signed URL or a raw key. Keys must be **tenant storage keys** (`tenants/<tenant-id>/...`), not `/sandbox` paths — copy the file out of the sandbox first.

`navigate` to `/admin/files` only when the user wants to browse or manage vault files, never as a way to hand over a file you just generated.

## Presenting

A newly written artifact opens on its own — **do not** call `show_artifact` after `artifact_write`. Use it only to bring back something from earlier in the conversation, or one the user closed.

On surfaces without a panel (background task runs, messaging channels) presenting is a no-op by design. The artifact still exists and is still attached to the work; nothing about your result depends on a panel being there.

## Analysis scripts

Write temporary data and scripts under `/sandbox`, run via workspace sandbox
tools (the user approves in the UI), then publish any file the user should keep
to durable Files/storage and register it with `artifact_write { file }`.
Results meant to be read go inline as `markdown` or `table`. For multi-step
sandbox work, load **sandbox-code-execution**.
