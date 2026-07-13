# Artifacts — Implementation Guide (Phase A + B)

> **Phase C: DONE 2026-07-14** on `feat/artifacts-external-storage`. External project
> storage per [artifacts.md](./artifacts.md) §2/§6-C, live-verified end-to-end against
> local Supabase's S3-compatible endpoint (connect → bind → promote → object lands in
> the bucket with correct content/mime; metadata.external_mirror recorded). Pieces:
> - **connections-sdk `ConnectorStorageCapability`** (write/delete/optional move) —
>   `storageCapabilityActions()` synthesizes `files_write` (group `write`),
>   `files_delete` (group `destructive`), `files_move` via `defineConnector`, so
>   ask-by-default policy, approvals, and audit apply like any action. S3 connector
>   implements it hand-rolled with aws4fetch beside its read capability.
>   **Deviation from the files-sdk-bridge plan, deliberate:** a files-sdk s3 adapter
>   would drag in @aws-sdk/client-s3 AND produce absolute-key refs inconsistent with
>   the read capability's prefix-relative refs. The bridge idea stays on the table for
>   Drive/OneDrive (their write actions already exist as hand-written actions).
> - **`ai.artifact_storage_binding`** (migration 20260714010000): per-scope
>   (task/project/goal) → connection_id (+folder_ref) soft ref, unique per scope.
>   DAL get/setStorageBinding (null clears), routes GET/PUT `/ai/artifacts/storage-binding`
>   (registered BEFORE `/:artifactId` — Hono route order).
> - **`connections_storage_targets`** + **`connections_files_write`** operations in
>   modules/connections: the first lists active, caller-visible connections whose
>   connector declares `storage` (feeds the picker); the second writes to an EXPLICIT
>   connection_id (bindings store ids, account-label addressing can't target them) with
>   the action policy still enforced inside executeConnectorAction.
> - **`ArtifactStoragePicker`** (ai-ui) rendered on the project Artifacts tab: platform
>   default + storage targets via `/api/tools/connections_storage_targets/invoke`.
> - **Mirror-on-promote**: `mirrorArtifactToBoundStorage` (apps/ai) called from the
>   `/store` route (injectable `mirrorArtifact` opt — absent in tests) and the
>   `artifact_store` tool (via the run's user token / EngentyCoreClient). Best-effort:
>   failures log and return; platform storage stays the render source of truth; success
>   recorded in `artifact.metadata.external_mirror` (+ tool output `mirrored`/`mirror_ref`).
> - E2E trick for dev: local Supabase exposes an S3 endpoint
>   (`supabase status` → S3_PROTOCOL_* keys, endpoint `http://127.0.0.1:54321/storage/v1/s3`,
>   region `local`) — an S3 connection against bucket `files` verifies and takes writes.
> - NOT built (still open): Drive/OneDrive storage capability, per-folder picker
>   (binding.folder_ref is stored/honored but has no UI), re-mirror on later versions
>   (only promote-time mirrors), mirror status surfaced in UI.

> **Phase B: DONE 2026-07-13** on `feat/artifacts-promotion` (merged into main v0.1.15+).
> Live-verified end-to-end: pin menu → store to project (tab leaves the chat, pane closes),
> project "Artifacts" tab lists + opens a project-scoped pane with scope badge, agent
> `artifact_store` tool (create → store in one turn), task DocSidebar section with live
> realtime update, row click opens the merged pane, task offered as one-click pin target.
> Deviations from §7, all deliberate:
> - `WorkspaceArtifactPane` generalized instead of a bespoke projects list-only panel:
>   optional `scope` (replaces the thread binding; used by the project tab) and
>   `extraScope` (merged after primary; task page passes `('task', taskId)`) — stored
>   artifacts must be openable in a pane, and tabs are the server list, so the pane needs
>   non-thread scopes. `useArtifactListSync` re-seeds on a combined `scopeKey`.
> - Pin menu is a Popover+Command (one surface for task target + project picker), not a
>   DropdownMenu; projects fetched via `/api/projects` (graceful empty state when the
>   projects module is absent). Task target read from `useCopilotShell().copilotContext
>   .scope.task_id/task_title` (set by task detail routes).
> - Scope badge renders only for non-thread scopes (a "Chat" badge on every chat tab is
>   noise).
> - Contributed project-detail tabs are per-project **opt-in** via the "Tabs konfigurieren"
>   dialog (host-page behavior, same as the files tab) — the Artifacts tab appears in the
>   catalog, not automatically in the strip.
> - Realtime invalidation reverted to whole-`artifactsQueryRoot`: an UPDATE event only
>   carries the NEW scope, so the Phase-A scope-confined invalidation missed the list an
>   artifact left on promotion (tab stayed in the chat until reload).

> **Phase A: DONE 2026-07-13** on `feat/artifacts-backend` (commits 3579f7c migration,
> f26a146 backend, aee7a02 ai-ui). Live-verified end-to-end (create/version/promote/
> tenant-isolation, markdown/html/table render, tabs, archive, auto-open, realtime
> INSERT + live content update). Deviations from this guide, all deliberate:
> - `thread_id` is a **soft reference (no FK)** — a hard FK broke artifact creation for
>   not-yet-persisted draft threads and would erase provenance on thread deletion.
> - The artifact list *is* the tabs (no client open-set); auto-open/reconcile extracted
>   to `useArtifactListSync` for testability.
> - Detail query is **keyed on `current_version`** so agent edits refetch live off the
>   (reliable) list-realtime rather than the in-place UPDATE-invalidation path.
> - Tool `execute` signature is `(input) => …` (positional), not `({context})`.
> - **Dev gotcha:** after adding `ai.artifact` to `supabase_realtime`, the *running*
>   realtime container had a stale publication cache — `docker restart
>   supabase_realtime_<project>` (no data loss) was needed once. Fresh installs publish
>   at boot, so no restart there.


Step-by-step build plan for [artifacts.md](./artifacts.md). Written so an implementer can
follow it without re-deriving decisions. Every step names the exact files, the pattern
file to copy, and the acceptance check. **Do not deviate from names/paths without
updating this doc.**

**Read first:** `docs/agent/DESIGN.md` (UI), `.claude/skills/release` (work mode).
Work on a branch from `main`. Gates after every step group:
`pnpm fix && pnpm check && pnpm typecheck` + the tests named in §9.

## 0. Ground rules & conventions (do not skip)

- The chat-session table is **`ai.thread`** (NOT `agent_session` — renamed). A thread id
  is `ai.thread.id`, a **uuidv7**.
- `ai.*` data is owned by **apps/ai**: DAL in `apps/ai/src/dal/`, HTTP routes in
  `apps/ai/src/api/`, served by Hono under base path `/ai`. The DAL uses the
  **service-role** supabase client (`apps/ai/src/infra/database.ts`) — RLS is bypassed on
  the API path; RLS + `authenticated` grants exist only for browser realtime.
- Migrations are authored in **`apps/core/supabase/migrations/`** (root
  `supabase/migrations/` is GENERATED by `scripts/aggregate-module-migrations.mjs` — never
  hand-edit it). Apply with `pnpm db:migrate`.
- Agent tools live in **`apps/ai/ai/tools/`** (note: `ai/`, not `src/ai/`), get tenant /
  user / token from `getEngentyToolsRunContext()` (AsyncLocalStorage), and are attached in
  `apps/ai/ai/agents/engenty.copilot/copilot-agent.ts` → `createEngentyCopilotAgentTools()`.
  Tool ids: strict `^[a-z0-9_]{1,64}$`.
- ai-ui fetches with plain `fetch` + `Authorization: Bearer` from
  `getCurrentAccessToken()` (`@engenty/api-client`); base URL via
  `resolveEngentyAiServiceBaseUrl()`; React Query via `@engenty/query-client` with
  query-key factory functions. Copy `packages/ai-ui/src/ag-ui/apps-ai/apps-ai-session-api.ts`.
- ai-ui tests need `/** @vitest-environment happy-dom */` as the first line.
- Run `pnpm fix` before committing (CI lints changed files).

## 1. Phase A step 1 — migrations

### 1a. `apps/core/supabase/migrations/<YYYYMMDDHHMMSS>_ai_artifacts.sql`

Use the current timestamp. Content (complete — adjust nothing but the timestamp):

```sql
create table "ai"."artifact" (
  "id" uuid primary key default public.uuidv7(),
  "tenant_id" uuid not null references core.tenants(id) on delete cascade,
  "type" text not null,
  "title" text not null,
  "scope_type" text not null check (scope_type in ('thread','task','project','goal')),
  "scope_id" text not null,
  "thread_id" uuid references ai.thread(id) on delete set null,
  "created_by_kind" text not null check (created_by_kind in ('agent','user')),
  "created_by" uuid,
  "current_version" integer not null default 1,
  "storage" text not null default 'inline' check (storage in ('inline','blob')),
  "storage_key" text,
  "storage_connection_id" uuid,
  "mime_type" text,
  "size_bytes" bigint,
  "status" text not null default 'active' check (status in ('active','archived')),
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create index artifact_tenant_scope_idx
  on ai.artifact (tenant_id, scope_type, scope_id) where status = 'active';
create index artifact_thread_idx on ai.artifact (thread_id);

create table "ai"."artifact_version" (
  "id" uuid primary key default public.uuidv7(),
  "artifact_id" uuid not null references ai.artifact(id) on delete cascade,
  "tenant_id" uuid not null references core.tenants(id) on delete cascade,
  "version" integer not null,
  "content" text,
  "storage_key" text,
  "summary" text,
  "created_by_kind" text not null check (created_by_kind in ('agent','user')),
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  unique (artifact_id, version)
);

alter table ai.artifact enable row level security;
alter table ai.artifact_version enable row level security;

grant select, insert, update, delete on table ai.artifact to service_role;
grant select, insert, update, delete on table ai.artifact_version to service_role;
```

### 1b. `apps/core/supabase/migrations/<YYYYMMDDHHMMSS+1>_ai_artifacts_realtime.sql`

```sql
grant select on table ai.artifact to authenticated;

create policy "artifact_select_tenant" on ai.artifact
  for select to authenticated
  using (tenant_id = core.current_tenant_id());

alter table ai.artifact replica identity full;

do $$ begin
  alter publication supabase_realtime add table ai.artifact;
exception when duplicate_object then null; end $$;
```

(Only `ai.artifact` streams — version inserts bump `artifact.updated_at` +
`current_version`, which is enough to invalidate queries. Do NOT publish
`artifact_version`.)

### 1c. Apply

```bash
node scripts/aggregate-module-migrations.mjs   # regenerates root supabase/migrations
pnpm db:migrate
```

**Accept:** `select * from ai.artifact;` succeeds in studio; both files appear in root
`supabase/migrations/` with the aggregation header.

## 2. Phase A step 2 — DAL

New folder `apps/ai/src/dal/artifacts/` — copy the shape of
`apps/ai/src/dal/agent-sessions/` (store factory + `types.ts` + `index.ts`).

`types.ts` — row types + input types:

```ts
export type ArtifactScopeType = "thread" | "task" | "project" | "goal";
export interface ArtifactRow { /* mirror table columns 1:1, snake_case */ }
export interface ArtifactVersionRow { /* mirror table columns 1:1 */ }
```

`artifact-store.ts` — `export function createArtifactStore(client: SupabaseClient)` with
`const db = client.schema("ai")`. Methods (all take `tenantId` and filter every query by
it — never trust an id alone):

| Method | Behavior |
|---|---|
| `create({tenantId, type, title, scopeType, scopeId, threadId, createdByKind, createdBy, content, mimeType})` | validate type via §4 registry; insert `artifact` (current_version 1) + `artifact_version` (version 1, content). Returns `{artifact, version}`. |
| `get({tenantId, artifactId, version?})` | artifact row + the requested (default: current) version row, or `null`. |
| `listByScope({tenantId, scopeType, scopeId, includeArchived?})` | active artifacts for the scope, `order updated_at desc`. Rows only — no version content (keep lists light). |
| `addVersion({tenantId, artifactId, expectedVersion, content, summary, createdByKind, createdBy})` | read artifact; if `current_version !== expectedVersion` throw `ArtifactVersionConflictError`; insert version `expectedVersion+1`; update artifact `current_version`, `updated_at`. |
| `updateScope({tenantId, artifactId, scopeType, scopeId})` | promotion: update the two scope columns (+`updated_at`). `thread_id` is untouched (provenance). |
| `setStatus({tenantId, artifactId, status})` | archive / restore. |

Export `ArtifactVersionConflictError` (class with `code = "version_conflict"`).
Content size guard: if `content.length > 262_144` throw `ArtifactContentTooLargeError`
(blob path is Phase C/D — inline only for now; `storage` stays `'inline'`).

Add `createArtifactStoreFromEnv()` next to `createAgentSessionStoreFromEnv()`
(`apps/ai/src/ai/index.ts` area) using the same service-role client.

## 3. Phase A step 3 — HTTP routes

New file `apps/ai/src/api/artifact-routes.ts` — copy the structure of
`apps/ai/src/api/agent-sessions-routes.ts` exactly (same `resolveScope` +
`handleRouteError` + zod validation style).

```ts
export function registerArtifactRoutes(app: Hono, opts: {
  artifactStore: ArtifactStore;
  scopeResolver: AiScopeResolver;
}): void
```

Routes, `const base = \`${AI_BASE_PATH}/artifacts\``:

| Route | Behavior |
|---|---|
| `GET base?scope_type&scope_id` | `listByScope` (zod: scope_type enum, scope_id non-empty). |
| `POST base` | create — body `{type, title, scope_type:'thread', scope_id, content}`; `created_by_kind:'user'`, `created_by: scope.userId`. |
| `GET base/:artifactId` | get (optional `?version=` int). 404 when null. |
| `POST base/:artifactId/versions` | body `{content, expected_version, summary?}` → `addVersion`. Map `ArtifactVersionConflictError` → **409**. |
| `POST base/:artifactId/store` | body `{scope_type:'task'\|'project'\|'goal', scope_id}` → `updateScope`. |
| `POST base/:artifactId/archive` | `setStatus('archived')`. |

Every handler: `resolveScope` first; pass `scope.scope.tenantId` into the store. Mount in
`apps/ai/src/app.ts` next to `registerAgentSessionRoutes` with the same `scopeResolver`.

**Accept:** with the dev stack running, `curl -H "Authorization: Bearer <token>"
https://engenty.localhost/ai/artifacts?scope_type=thread&scope_id=<uuid>` returns `[]`.

## 4. Phase A step 4 — type registry (server)

`apps/ai/src/ai/artifacts/artifact-types.ts` (no new package — colocate; extract to
`packages/artifacts` only when a second consumer exists):

```ts
export interface ArtifactTypeDescriptor {
  type: string; mimeType: string;
  validate(content: string): void;   // throw ArtifactInvalidContentError on bad shape
}
const TYPES = new Map<string, ArtifactTypeDescriptor>();
export function registerArtifactType(d: ArtifactTypeDescriptor): void
export function getArtifactType(type: string): ArtifactTypeDescriptor  // throws unknown-type
```

Register three: `markdown` (`text/markdown`, validate = non-empty string), `html`
(`text/html`, non-empty), `table` (`text/csv`; validate = parses as CSV with ≥1 row OR is
a JSON array of objects). The DAL `create`/`addVersion` call `getArtifactType(...).validate(...)`.

## 5. Phase A step 5 — agent tools

New file `apps/ai/ai/tools/artifact-tools.ts` — copy the pattern of
`apps/ai/ai/tools/registry-agents-list-tool.ts` (`createTool` from `@mastra/core/tools`,
context via `getEngentyToolsRunContext()`), but call the store directly via
`createArtifactStoreFromEnv()` (do NOT go over HTTP — same process).

`export function createArtifactTools()` returning four tools:

| id | input (zod) | behavior |
|---|---|---|
| `artifact_create` | `{type: enum('markdown','html','table'), title: string, content: string}` | scope = current thread: `scopeType:'thread'`, `scopeId: ctx.orchestratorThreadId`, `threadId: ctx.orchestratorThreadId`, `createdByKind:'agent'`. Output `{artifact_id, version}`. Description must tell the model: "Create a document artifact the user can see in the artifact panel. Prefer this over pasting long documents into chat." |
| `artifact_update` | `{artifact_id, content, expected_version: number, summary: string}` | `addVersion`; on conflict return `{error:'version_conflict', current_version}` (do not throw — let the model retry with fresh version). |
| `artifact_get` | `{artifact_id, version?}` | returns artifact + content. |
| `artifact_list` | `{}` | `listByScope` for the current thread. |

All tools hard-fail with a clear message when `ctx.tenantId` or `ctx.orchestratorThreadId`
is missing. Wire into `createEngentyCopilotAgentTools()` in
`apps/ai/ai/agents/engenty.copilot/copilot-agent.ts`: `...createArtifactTools(),`.

## 6. Phase A step 6 — ai-ui data layer + store swap

### 6a. Fetch layer — `packages/ai-ui/src/artifacts/artifacts-api.ts`

Copy `packages/ai-ui/src/ag-ui/apps-ai/apps-ai-session-api.ts` structure: fetch functions
(`listArtifacts({baseUrl, scopeType, scopeId})`, `getArtifact`, `createArtifactVersion`,
`storeArtifact`, `archiveArtifact`), headers via the same helper pattern
(`getCurrentAccessToken`), plus query keys:

```ts
export const artifactsQueryRoot = ["artifacts"] as const;
export const artifactsListQueryKey = (scopeType, scopeId) => [...artifactsQueryRoot, "list", scopeType, scopeId];
export const artifactDetailQueryKey = (artifactId, version?) => [...artifactsQueryRoot, "detail", artifactId, version ?? "current"];
```

And hooks `useArtifactsListQuery(scopeType, scopeId)` / `useArtifactDetailQuery(artifactId)`.

### 6b. Store swap — `packages/ai-ui/src/artifacts/artifact-store.ts`

**The tab model changes: tabs ARE the server list.** Active thread artifacts = the tabs;
no client-side "open set". This deletes complexity rather than adding it:

- Keep the keyed external store, but its state shrinks to
  `{activeId: string|null, paneOpen: boolean, paneExpanded: boolean}` (pure UI state).
- `useArtifacts(hostKey)` keeps its exact public shape BUT `artifacts` now comes from
  `useArtifactsListQuery('thread', threadId)` — add a required `threadId` param:
  `useArtifacts(hostKey, threadId | null)` (empty list when null). Update the three call
  sites (`ArtifactPane`, `WorkspaceArtifactPane`, `ArtifactPaneToggle` — thread id comes
  from `useCopilotThreadBinding()` inside `WorkspaceArtifactPane`/toggle, passed down as
  prop to `ArtifactPane`).
- `close(id)` → `archiveArtifact` mutation (tab disappears when list refetches).
- `open(artifact)` → just `activeId = id; paneOpen = true` (creation happens server-side).
- **Auto-open rule:** when the list query gains an artifact id that wasn't present in the
  previous data (tracked with a ref of known ids per thread), set
  `activeId = newest id; paneOpen = true`. This is how agent-created artifacts surface.
- Delete `seedPlaceholderArtifacts` + its dev-seed effect in
  `modules/engenty-copilot/ui/pages/chat-page.tsx`, and `PLACEHOLDER_ARTIFACT_TYPE`
  usage there. Keep `clearArtifactsForTests`.

### 6c. Realtime — `packages/ai-ui/src/artifacts/artifacts-realtime.ts`

Copy `packages/ai-ui/src/threads/engenty-threads-realtime.ts`: subscribe
`{schema:"ai", table:"artifact", event:"*", filter:"tenant_id=eq.<tenantId>"}` via
`@engenty/live-cache` `subscribePostgresChanges`; on change invalidate
`artifactsQueryRoot`. Mount the subscription where the threads one is mounted
(`EngentyThreadsProvider` neighborhood).

### 6d. Renderers — replace the placeholder renderer

In `packages/ai-ui/src/artifacts/artifact-renderers.tsx` register:

- `markdown`: read-only tiptap — `@engenty/tiptap-editor` `BaseEditor` (or
  `RichEditor readOnly`) fed with `markdownToJson(content)`.
- `html`: sandboxed iframe — copy the sandboxing attributes from
  `packages/ai-ui/src/components/copilot/tool-call/mcp-app-tool-call-card.tsx`
  (`iframe srcDoc` + its `sandbox=` attribute list, verbatim).
- `table`: parse CSV (or JSON array) → ui-core `Table` components; on parse failure show
  the raw content in a `<pre>`.

The renderer receives content via a new `ArtifactViewProps` field: `content: string`
(the pane fetches the current version with `useArtifactDetailQuery(activeId)` and passes
it down; show `Spinner` while loading).

### 6e. Open-in-pane from tool cards

In `modules/engenty-copilot/ui/register-tool-call-ui.tsx` add a registration matching
`toolName === "artifact_create" || toolName === "artifact_update"`: render a compact card
(copy an existing simple card in that file) showing the artifact title + an
"open" button that calls `activateArtifact(hostKey, output.artifact_id)` +
`setArtifactPaneOpen(hostKey, true)`.

**Accept (manual, dev stack):** ask the copilot *"Create a markdown artifact titled Test
with a short poem"* → pane auto-opens with a rendered markdown tab; *"add a second
verse"* → content updates in place (realtime); close tab archives it.

## 7. Phase B — promotion + surfaces (after A is verified)

1. **Tool** `artifact_store` in `artifact-tools.ts`: input
   `{artifact_id, scope_type: enum('task','project','goal'), scope_id}` → `updateScope`.
   Description: "Store an artifact permanently on a task, project, or goal. Ask the user
   which scope if unclear."
2. **Pin UI**: in `ArtifactPane`'s top bar actions add a pin `DropdownMenu` (icon `Pin`):
   items "Store to task …" (visible when the current route context has a task —
   `useCopilotShell().copilotContext`), "Store to project…" (project picker: reuse the
   picker pattern from `modules/tasks/ui/components/task-project-property-row.tsx`).
   Calls the `storeArtifact` mutation. Scope badge (`thread`/`task`/`project`) rendered
   next to the tab strip.
3. **Projects "Artefacts" tab**: export `ProjectArtifactsPanel({projectId})` from ai-ui
   (list via `useArtifactsListQuery('project', projectId)`, rows = title/type/updated_at,
   click → open artifact in the pane). Register the tab in
   `modules/projects/ui/plugin.ts` via `engenty.UI.registerTab({id:"artifacts",
   surface:"projects.detail", component: ..., labelKey:"projects:artifactsTab",
   order:310})` — copy `modules/files/ui/plugin.ts:59` verbatim; add locale keys
   (`en` "Artifacts" / `de` "Artefakte").
4. **Task DocSidebar section**: in `modules/tasks/ui/pages/task-detail-page.tsx` sidebar,
   under `TaskLinkedSessionsPanel`, list task-scoped artifacts (same list hook,
   `('task', task.id)`) — row click opens the pane.

## 8. Explicit non-goals for A+B (do NOT build)

No blob storage (inline content only; enforce the 256KB guard). No external storage /
files-sdk bridge (Phase C). No user editing (renderers are read-only). No react/slides
types. No search indexing. No pagination (cap lists at 100, `order updated_at desc`).
No artifact pane on module pages other than chat + tasks detail (already wired).

## 9. Tests — outcome-focused, fixed list

**Philosophy: test behavior/outcomes, not functions.** Do NOT add tests beyond this list
without a reason written in the PR; do NOT snapshot-test renderers; do NOT assert on
supabase call shapes (that mirrors the implementation); do NOT test each store method in
isolation when a flow test covers it.

| # | File | Outcomes asserted |
|---|---|---|
| 1 | `apps/ai/src/__tests__/artifact-routes.test.ts` (copy `agent-sessions-routes.test.ts` harness: real Hono + hand-rolled in-memory fake store + `createStaticAiScopeResolver`) | (a) create → get roundtrip returns version 1 with content; (b) update with stale `expected_version` → **409** and current version unchanged; (c) promote (`/store`) → subsequent list under the new scope contains it, old scope doesn't; (d) requests without bearer → 401; (e) a tenant-B scope resolver cannot read tenant-A's artifact (fake store keyed by tenant) → 404. |
| 2 | `apps/ai/src/dal/artifacts/artifact-store.test.ts` (chainable supabase fake, pattern: `modules/time-tracking/src/dal/supabase.test.ts`) | ONLY the real logic: (a) version conflict throws `ArtifactVersionConflictError`; (b) >256KB content throws; (c) unknown type rejected; (d) `create` writes artifact + version 1 atomically-shaped (both inserts issued). |
| 3 | `apps/ai/ai/tools/artifact-tools.test.ts` (fake store injected; run-context ALS seeded like existing tool tests) | (a) `artifact_create` scopes to `ctx.orchestratorThreadId` + `ctx.tenantId` and returns `{artifact_id, version:1}`; (b) missing thread context → clear error, no store call; (c) `artifact_update` maps conflict to `{error:'version_conflict', current_version}` instead of throwing. |
| 4 | `packages/ai-ui/src/artifacts/artifact-store.test.ts` (adapt the existing file; mock `artifacts-api.js` hooks like `use-engenty-threads.test.ts` mocks its api module) | UI-state outcomes: (a) a NEW id appearing in the list auto-opens the pane and activates it; (b) ids present on first load do NOT auto-open; (c) `paneExpanded` still resets when the pane closes; (d) close calls the archive mutation and clears `activeId` when it was active. |

That's it — 4 files. Phase B adds exactly one more: extend file 1 with the promote case
(already listed as 1c) and one ai-ui test asserting the projects panel hook filters by
`('project', projectId)` — nothing else.

**Manual verification checklist** (this is the real acceptance, not more unit tests):
the §6e flow; refresh mid-conversation → artifacts still there (persistence); open the
same thread in a second tab → pane content matches (realtime); promote to project → shows
up in the projects Artefacts tab; archive → gone from tabs but row kept in DB.

## 10. Order of work & gates

1. §1 migrations → `pnpm db:migrate` green.
2. §2 DAL + test 2 → `pnpm --filter @engenty/ai... test` (whatever apps/ai's filter is — `pnpm --filter ai test`).
3. §3 routes + test 1.  4. §4 types (covered by tests 1+2).
5. §5 tools + test 3 → manual: copilot creates an artifact (check DB row).
6. §6 ai-ui + test 4 → manual checklist.
7. `pnpm fix && pnpm check && pnpm typecheck && pnpm test` all green → commit per step
   group with conventional commits (`feat(ai): …`, `feat(ai-ui): …`).
8. Phase B (§7) as a second PR/commit series.
