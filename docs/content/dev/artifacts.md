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

An artifact is created **thread-scoped** — it belongs to the chat that produced
it and appears in that chat's pane tabs. `artifact_store` promotes one to a
`task`, `project`, or `goal` scope, which moves it out of the chat's tab list
and into that record's documents.

## Types

The server keeps a type registry (`apps/ai/src/ai/artifacts/artifact-types.ts`).
A descriptor declares a MIME type and validates content shape before it is
persisted:

| Type | For | MIME |
|---|---|---|
| `markdown` | Prose, notes, drafts | `text/markdown` |
| `html` | Rich formatted output | `text/html` |
| `table` | CSV, or a JSON array of rows | `text/csv` |

`ARTIFACT_TYPE_IDS` derives the zod enums used by both the agent tool and the
HTTP routes, so the three stay in sync from one source.

## Agent tools

- **`artifact_create`** `{ type, title, content }` — creates a thread-scoped
  artifact and returns `{ artifact_id, version }`.
- **`artifact_update`** — appends a new version.
- **`artifact_store`** — promotes a thread artifact to a `task`/`project`/`goal`.
- **`show_artifact`** — opens an existing artifact in the pane.

The agent is told to prefer `artifact_create` over pasting a long document into
the chat.

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
