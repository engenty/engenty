# Artifacts — Backend & Lifecycle Spec

Status: **draft for discussion** (2026-07-13). Implementation steps: [artifacts-implementation.md](./artifacts-implementation.md). The "proper artifact implementation" from
[app-shell-unification.md](./app-shell-unification.md) Phase 2 — replaces the in-memory
placeholder store behind `useArtifacts` without touching pane/tab consumers.

## 1. What an artifact is

An **AI-generated document** shown, interacted with, and edited through an agent (chat).
Content types are open-ended — markdown, HTML, React widgets, tables (CSV/XLSX), slides,
docs — behind an extensible type interface. An artifact has an id, a title, a type, a
version history, a **binding scope**, and (optionally) blob storage.

### Lifecycle / binding scopes

> **Shipped differently.** `goal` was not built; the scopes are `thread`, `task`,
> `project`, `space`, `agent`. Current behaviour:
> [artifacts.md](../content/dev/artifacts.md#scope).

| Scope | Meaning | Lifetime |
|---|---|---|
| `thread` | attached to the chat session that produced it | short-lived, follows the thread |
| `task` | bound to a task | task lifetime |
| `project` / `goal` | stored in the project/goal | long-term, shared |

Artifacts are **born thread-scoped**; the agent or the user (pin) **promotes** them to
task/project/goal. Promotion is a **move with provenance** (one canonical row; the origin
`thread_id` is kept), not a copy — copies would silently diverge. (Open question 1.)

## 2. Data model (grounded in existing conventions)

New tables in the **`ai` schema** (core-owned, like `ai.thread` — artifacts are chat
infrastructure, always installed; module-schema alternative in open question 2). Ids are
**uuidv7** per `ai.*` convention; `thread_id` FKs `ai.thread(id)` (the sessions table —
renamed from `agent_session`).

```sql
ai.artifact
  id               uuid pk default public.uuidv7()
  tenant_id        uuid not null references core.tenants(id) on delete cascade
  type             text not null              -- 'markdown' | 'html' | 'table' | 'react' | 'slides' | 'file' | ...
  title            text not null
  scope_type       text not null check (scope_type in ('thread','task','project','goal'))
  scope_id         text not null              -- thread uuid | task id | project id | goal id
  thread_id        uuid references ai.thread(id) on delete set null   -- origin, survives promotion
  created_by_kind  text not null check (created_by_kind in ('agent','user'))
  created_by       uuid                        -- user id when user-created/edited
  current_version  int not null default 1
  storage          text not null default 'inline' check (storage in ('inline','blob'))
  storage_key      text                        -- tenants/<tid>/artifacts/<artifact-id>/... when blob
  storage_connection_id uuid                   -- external storage connection (Phase C), null = platform storage
  mime_type        text
  size_bytes       bigint
  status           text not null default 'active' check (status in ('active','archived'))
  metadata         jsonb not null default '{}'
  created_at / updated_at

ai.artifact_version
  id            uuid pk default public.uuidv7()
  artifact_id   uuid not null references ai.artifact(id) on delete cascade
  tenant_id     uuid not null
  version       int not null                  -- unique (artifact_id, version)
  content       text                          -- inline content for text types (≤ ~256KB)
  storage_key   text                          -- per-version blob for large/binary
  summary       text                          -- agent's change note ("added Q3 column")
  created_by_kind / created_by
  created_at
```

- Scoping tuple `(scope_type, scope_id)` mirrors the files module's `(owner_type, owner_id)`.
- **Every edit is a new version** — agents edit via tools, users via type editors; optimistic
  concurrency by `expected_version` on update.
- RLS enabled, no policies; access via core API with service role (standard module pattern).
- Realtime publication migration (`*_realtime.sql`) so the pane live-updates while the agent
  writes (`registerLiveBinding` on `ai.artifact` / `ai.artifact_version`).

### Blob storage & scoping

- **Inline first**: text types below the threshold live in `artifact_version.content` — no
  storage round-trip for the common markdown/html/table case.
- **Blob path is artifact-id-keyed, not scope-keyed**:
  `tenants/<tenant>/artifacts/<artifact-id>/v<version>/<filename>` via the existing
  `FileStorageService` (Supabase provider, bucket `files`, `assertTenantScopedStorageKey`).
  Promotion changes only DB scope — blobs never move. Tenant > project > task scoping is
  enforced in the DB row + API authz, not by path shape.
- **External storage (Phase C) — files-sdk as the adapter layer, connections as the
  credential layer** (decision 2026-07-13). [`files-sdk`](https://github.com/haydenbleasel/files-sdk)
  (already a dependency: workspace FS + the Supabase provider wrap it) provides full CRUD
  (`upload/download/delete/copy/move/list/url/signedUploadUrl`) over S3-compatibles, cloud
  blobs, Supabase, and consumer providers (Google Drive, OneDrive, Dropbox, Box). It does
  **no auth management** — adapters are constructor-configured with raw credentials or
  OAuth access tokens. That is precisely what the connections framework already owns
  (encrypted secrets, `withFreshAccessToken` refresh, allow/ask/deny policy, audit,
  multi-account). **No separate connection settings**: a connector gains a
  `storage` capability implemented ONCE as a files-sdk bridge —
  `filesSdkStorageCapability(adapterFactory)` — where each connector only supplies
  `adapterFactory(ctx)` (S3: keys/bucket from connection config; Drive/OneDrive: fresh
  access token). The bridge synthesizes full-CRUD gateway ops (`files_write`,
  `files_delete`, `files_move`, … alongside the existing read ops), inheriting policy
  gates (writes default to `ask`) and audit for free. Project artifact storage settings =
  **pick an existing connection** (filtered to storage-capable connectors). Exception:
  `local-files` (browser FSA bridge) stays a special case — it is browser-side, not a
  server adapter. On promotion to a project with connected storage, content is
  **mirrored** to the connection; platform storage stays the fallback and source of truth
  for rendering. Model: start with **one connection per project**, schema already allows
  many later (`storage_connection_id` per artifact). Follow-ups: bump `files-sdk` to a
  version shipping the consumer adapters; optionally migrate the hand-rolled read-only
  `ConnectorFilesCapability` handlers (Drive/Graph/S3) onto the same bridge.

## 3. Type extensibility — the provider interface

Two registries, one per side:

**Server — artifact type descriptors** (colocated in `apps/ai/src/ai/artifacts/` — extract
to a `packages/artifacts` only when a second consumer exists):
```ts
interface ArtifactTypeDescriptor {
  type: string;                    // 'markdown', 'html', 'table', ...
  mimeType: string;
  inlineable: boolean;             // may live in artifact_version.content
  validate(content: string): void; // shape check on write
  export?: (content) => Promise<ExportedFile>;  // docx/xlsx/pdf via @engenty/doc-converter
}
```

**Client — renderer/editor registry** (exists: `registerArtifactRenderer` in ai-ui; add an
optional `Editor` per type):

| Type | Render | Edit (user) | Phase |
|---|---|---|---|
| `markdown` | tiptap read-only (md↔JSON round-trip exists) | tiptap `RichEditor` | A / D |
| `html` | sandboxed `iframe srcDoc` (same mechanism as MCP-app cards) | — | A |
| `table` | table view from CSV/JSON | — (csv-import later) | A |
| `react` | sandboxed iframe + esbuild bundle | — | D |
| `slides` / `docx` / `xlsx` | export-oriented via doc-converter | — | D |

## 4. Agent tools (gateway operations)

Registered like `registerInboxGatewayMethods`; discovered via `engenty_tools_search`,
executed via `engenty_tool_execute`. Strict snake_case ids:

| Operation | Behavior | Risk |
|---|---|---|
| `artifact_create` | new artifact in the current thread scope (type, title, content) | low |
| `artifact_update` | new version (content or patch, `expected_version`, summary) | low |
| `artifact_get` / `artifact_list` | fetch one / list by scope | low |
| `artifact_store` | promote to task / project / goal | medium |

The copilot's **route context** supplies the candidates for `artifact_store` (current task
id on a task page, project from route) — same source the workspace hooks already use.
Tool-call cards for these ops get an **"open in pane"** affordance (the artifact id is in
the tool output) — this lands the open-in-pane item from the shell plan with real data.

## 5. UI surfaces

1. **Artifact pane** (exists): `useArtifacts` internals swap from in-memory to a React
   Query-backed client (list by current thread + explicitly opened ids); open-tab state
   stays client-side. Live bindings keep the pane streaming while the agent edits.
   Placeholder seeds are deleted.
2. **Pin / store control** in the pane top bar: pin menu → "Store to task ENG-73" (route
   context), "Store to project…" / "goal…" (picker). Mirrors the agent's `artifact_store`.
3. **Projects "Artefacts" tab**: `engenty.UI.registerTab({ surface: "projects.detail",
   id: "artifacts", order: ~310 })` — exactly the files-module pattern
   (`ProjectFilesTab`). Lists project-scoped artifacts; row click opens in the pane.
4. **Task detail**: task-scoped artifacts listed in the DocSidebar (a section under
   linked sessions) — click opens the pane. (Phase B.)

## 6. Phases

- **A — Entity + thread scope + real pane** *(unblocks everything)*: migration, core API,
  `packages/artifacts` contracts, agent tools (create/update/get/list), ai-ui store swap,
  markdown/html/table renderers, open-in-pane from tool cards, realtime bindings.
- **B — Promotion + surfaces**: `artifact_store` + pin UI, task/project/goal scopes,
  projects "Artefacts" tab, task DocSidebar section.
- **C — External project storage**: files-sdk-backed `storage` capability bridge on the
  connections framework (one implementation, per-connector adapter factories; S3 first,
  Drive/OneDrive next), project storage settings (pick a connection), mirror-on-promote,
  supabase fallback.
- **D — Types & editing**: react sandbox, slides, exports via doc-converter, tiptap user
  editing for markdown, retrieval-service indexing.

## 7. Open questions

1. **Move vs copy on promotion** — spec says move + provenance; confirm.
2. **`ai` schema (core-owned) vs `module_artifacts`** — spec leans core (chat
   infrastructure, pane lives in ai-ui which is always present). A module would buy
   install-gating we probably don't want for a platform primitive.
3. **Goal scope** — goals live in the tasks module; `scope_id text` handles the reference,
   but should goal-scoped artifacts appear on the goal detail page in Phase B or later?
4. **Version retention** — keep all versions forever, or prune thread-scoped artifacts
   with their thread?
5. **External storage as mirror vs primary** — spec says mirror (platform copy remains
   authoritative for rendering); primary-on-connector would make rendering depend on
   connector availability + read latency.
6. **Who may promote** — any participant, or task/project write capability required
   (authz caps exist: `module.tasks.*` style)?

## 8. Key existing building blocks (from codebase survey)

`packages/file-storage` (FileStorageService, supabase provider, tenant path guards) ·
connections `files` capability + `executeConnectorAction` + policy/audit
(`packages/connections-sdk`, `modules/connections`) · S3/Drive/OneDrive/local-files
connectors · `registerTab` projects.detail (worked example `modules/files/ui/plugin.ts:59`) ·
`ai.thread` thread ids (uuidv7) + `workspace_key` · gateway operations +
`engenty_tool_execute` bridge (`modules/inbox/src/api/gateway-methods.ts`) ·
`@engenty/tiptap-editor` (md↔JSON, RawHtml extension) · `@engenty/live-cache`
`registerLiveBinding` · `@engenty/doc-converter` for exports.
