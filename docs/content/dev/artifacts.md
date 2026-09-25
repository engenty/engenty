---
title: Artifacts
description: Agent-authored documents — how they are stored, versioned, rendered, and how to add a type.
---

# Artifacts

An **artifact** is a document the agent writes for the user: a draft, a report, a
table of numbers. It exists so long content does not have to be pasted into the
conversation — the agent creates the document, the chat shows a card, and the
user opens it in the artifact pane beside the chat.

Artifacts are **authored content**. Records that already live in a module —
contacts, offers, tasks — are not artifacts; those are [objects](./objects), and
they are referenced rather than copied.

## Where artifacts live

Three tables in the `ai` schema:

| Table | Holds |
|---|---|
| `ai.artifact` | The artifact: `type`, `title`, scope, `current_version`, storage mode |
| `ai.artifact_version` | One row per version, with the `content` |
| `ai.artifact_storage_binding` | Per-scope binding to an external storage connection (mirroring) |

Every write appends a new `ai.artifact_version` row and bumps
`artifact.current_version`, so history is kept rather than overwritten.

### Storage modes

`artifact.storage` is `"inline" | "blob"`. Today everything is written
**inline**: the content lives in `artifact_version.content` in Postgres, capped
at **256KB** (`ARTIFACT_INLINE_CONTENT_MAX_BYTES` in
`apps/ai/src/dal/artifacts/artifact-store.ts`). Content over the cap is rejected
on write. `blob` is declared in the type and the catalog filters, but the write
path does not produce it yet — that is a later phase.

Separately, `ai.artifact_storage_binding` maps a scope to a storage connection
and folder so artifacts can be **mirrored** out to external storage
(`apps/ai/src/ai/artifacts/artifact-mirror.ts`). The binding is about copying
content outward; it is not where the artifact is read from.

### Scope

Scopes: `thread`, `task`, `project`, `space`, `agent` (`ai.artifact`
`scope_type`). Where a new artifact lands depends on who creates it: an Engenty
in a Space stores it on the **Space** so later runs can update it; the Copilot
keeps it on the **thread** — the chat that produced it, shown in that chat's
pane tabs. `store_to` on `artifact_store` puts it on a `task`, `project`,
`space`, or an Engenty (`agent`, scope id = the agent id), which moves it out of
the chat's tab list and into that record's documents.

## Types

The server keeps a type registry (`apps/ai/src/ai/artifacts/artifact-types.ts`).
A descriptor declares a MIME type and validates content shape before it is
persisted:

| Type | For | MIME |
|---|---|---|
| `markdown` | Prose, notes, drafts | `text/markdown` |
| `html` | Rich formatted output | `text/html` |
| `table` | CSV, or a JSON array of rows | `text/csv` |
| `database` | A Space table (column definition + rows). Handle `{ table_id }` | `application/vnd.engenty.database+json` |
| `app` | An engenty App instance (**handle**) | `application/vnd.engenty.app+json` |
| `file` | A file in tenant storage (**handle**) | `application/vnd.engenty.file+json` |

`ARTIFACT_TYPE_IDS` derives the zod enums used by both the agent tool and the
HTTP routes, so the three stay in sync from one source.

### Handle types

`app`, `file`, and `database` store a **reference**, not the bytes: the App's source lives in
`module_apps`, the file's bytes stay in tenant storage. Keeping the artifact
tiny is what lets an App or a 40 MB spreadsheet be scoped, promoted and
presented through the ordinary artifact machinery. `ARTIFACT_HANDLE_TYPES` is
what the mirror checks — writing a handle out to a bound folder would copy the
JSON and call it the document.

A `file` handle is `{ key, name?, mime_type? }`. The pane renders it with the
same preview the Files tab uses and downloads the stored object rather than the
handle.

## Agent tools

- **`artifact_write`** — creates (no `artifact_id`) or updates (with
  `artifact_id` + `expected_version`), and promotes with `store_to`. Pass
  `file: { key, name?, mime_type? }` instead of `content` to register a stored
  file; the type is then implied.
- **`artifact_read`** — current or specific version, or lists the chat's
  artifacts when given no id.
- **`show_artifact`** — re-opens one that is no longer in view, returning a
  presentation handle `{ artifact_id, title, type, mime_type }`.
- **`table_write` / `table_read`** — Space **databases** (typed columns +
  rows), not the CSV `table` artifact. Create needs `title` + `columns`;
  rows go in `insert` / `update` / `delete`. Column types: `text`, `boolean`,
  `number` (`integer` \| `decimal` \| `percent` \| `currency` + ISO code),
  `date` (`date` \| `datetime` \| `time`, including `timePrecision: "hours"`),
  `duration` (writer unit + display format, stored as milliseconds), `select`
  (`options` + `allowCustom`). The Ablage listing is a `database` handle
  `{ table_id }`; rows live in `ai.data_table` / `ai.data_table_row`.

The agent is told to prefer an artifact over pasting a long document into the
chat, and over handing out storage keys or links.

### Why `show_artifact` is not a frontend tool

Frontend tools suspend the run until a browser resumes them, so a surface that
cannot resume — a background task job, a messaging channel — parks forever.
Presentation touches no client-local state, so it stays server-side: the tool
returns a handle and each surface renders it as it can (a pane tab in the SPA,
a link on a channel, nothing at all headless). The pane also opens a freshly
created artifact on its own via `useArtifactListSync`, so `show_artifact` is
only for bringing back something out of view.

## Adding a type

A type needs two registrations — one per side.

**Server** — validate and declare the MIME type:

```ts
// apps/ai/src/ai/artifacts/artifact-types.ts
registerArtifactType({
  type: "mermaid",
  mimeType: "text/vnd.mermaid",
  validate(content) {
    if (!content.trim()) {
      throw new ArtifactInvalidContentError("mermaid artifact is empty");
    }
  },
});
```

Add the id to `ARTIFACT_TYPE_IDS` so the tool and route schemas accept it.

**Client** — render it in the pane:

```tsx
import { registerArtifactRenderer } from "@engenty/ai-ui";

registerArtifactRenderer("mermaid", ({ artifact, content }) => (
  <MermaidView chart={content ?? ""} title={artifact.title} />
));
```

`registerArtifactEditor` is the same shape for the editing surface. Both return
an unregister function. Register from your module's UI plugin `init`, next to
your other registrations — the pane resolves a renderer by the artifact's
`type`, so an unregistered type simply has no view.

## The pane

`WorkspaceArtifactPane` renders the tab strip and the active artifact. It is
mounted by the full-page chat and by task detail, both under the
`ENGENTY_COPILOT_HOST_KEY` host — the same key the drawer binds to, so one pane
serves the surfaces that have one. The pane also hosts transient **object
tabs**; see [Objects](./objects).
