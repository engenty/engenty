# PLAN — Where work lives: one scope model for artifacts, files & workspaces

**Status:** planned · 2026-07-24
**Decision basis:** 2026-07-24 deep dive (claude.ai artifact `dfb53e58`, §7/§8) + Matthias's
mental model, reviewed and decided in-session.
**Work mode:** directly on `main`. Zero migrations. Runs AFTER
`PLAN-harness-hardening.md` Phase 1 (Mastra rename is boot-blocking); the routine plan's
workspace phases CONSUME this plan's convention (see "Interplay" at the end).

## 1. The model (decided)

One containment hierarchy, smallest to largest:

```
Thread  >  Task  >  Goal | Routine | Phase  >  Project  >  Global
```

- **It is a mental model over existing data, not a new subsystem.** Every edge already
  exists: thread→task (run records), task→goal (`goal_id`), task→routine
  (`trigger_id`), goal→project (`goals.project_id`), task→project (`project_id`).
  Edges are OPTIONAL — free-floating chat threads and goalless routine tasks are normal;
  the Global tier is the union that catches everything parentless.
- **Containers aggregate up; contents inherit down.** A goal's UI shows all
  artifacts/files of its tasks and their run threads. A specialist run sees its
  task's, goal's, and routine's shared material as context. Same edges, both
  directions.
- **Goal | Routine | Phase is one TIER, not one type.** They are sibling kinds of
  "task container". A task belongs to at most one of goal/routine (either-or today).
- **Goals ↔ phases: LINKED, not merged (Matthias, 2026-07-24).** `module_projects.
  project_phases` stays untouched (it is alive: realtime binding, phase handlers,
  DAL). Conceptually both hold tasks; the project UI presents a project-linked goal
  as a phase-like lane next to real phases. UI presentation only — no schema change,
  no cross-writes between the two tables.
- **One store per medium, five views.** `ai.artifact` remains THE artifact store; the
  `files` bucket remains THE workspace file store. Every tier's UI is the same
  catalog/panel component with a container filter — if a tier grows its own storage
  table or bespoke panel, this plan has failed its own test.

**The two simplifications this buys (net-negative complexity):**
1. **Promotion dies.** Today an artifact must be promoted (`artifact_store`) from
   thread scope to task/goal/project to become visible there. Under containment,
   visibility comes from edges — the earlier idea "auto-promote run artifacts in
   finalizeStep" becomes unnecessary and is hereby dropped. `artifact_store` is
   demoted to an optional "pin" (curation, not visibility).
2. **The stray stores get absorbed.** `/shared` commons (`ai/workspace/commons/`) IS
   the Global tier's folder. The copilot-only vault (`vault_*` tools) is deprecated
   in favor of workspace writes (Phase 6). Task/routine/goal folders are siblings
   under one `ai/workspace/` convention instead of three ad-hoc inventions.

### 1b. Storage roles & external stores (the store layer under the view)

The hierarchy is a VIEW; underneath sit exactly two platform stores by role, plus
external stores as projections:

| Store | Role | Who writes | External connection |
|---|---|---|---|
| `ai.artifact` | Versioned deliverables — "what was produced"; indexed, ref-addressable, reviewable | Agents (`artifact_create`) + humans (editors) | Mirror-on-pin via the per-container storage binding (`ai.artifact_storage_binding`, unique per `(tenant, scope_type, scope_id)`) |
| Files bucket · **agent workspace** (`ai/workspace/…`) | The machine's working directory per container tier — scratch, state, cross-run continuity | Agents via mounts (`/task /goal /routine /shared`) | None directly — deliberate: working state stays platform-side |
| Files bucket · **file spaces** (`module_files`, per owner) | Human file manager (project Files tab) — uploads, curated docs | Humans (UI); agents only via explicit connector/file ops | **Mounted folders** (gdrive/onedrive/s3/local + `connection_id`), **N per space** — bytes live externally, projected in |

Principles (bind the implementation):
- **A project links to multiple storages** through its file space's mounts (N) — that
  capability exists today (`20260706140000_plugin_files_connector_mounts.sql`) and is
  untouched by this plan. The artifact-mirror binding stays at most ONE target per
  container (it answers "where do pins go", not "what can I browse").
- **Canonical inside, projections outside.** The platform copy of an artifact is
  always authoritative; external copies are mirrors. An agent CAN write straight to
  Google Drive via the connector ops (`connections_files_write`, approval-gated) —
  but that produces a Drive file, not an artifact (no versions, no index, no
  `module:entity:id` ref). The artifact-shaped path to Drive is: create artifact →
  pin to a container with a Drive binding → mirror writes the external copy
  (`apps/ai/src/ai/artifacts/artifact-mirror.ts`).
- **Mirror must follow versions** (upgrades the known v1-only gap): with pin demoted
  to curation, a pinned artifact's NEW versions re-mirror to the bound target
  (Phase 6 item below). Failures stay best-effort + logged; platform copy never
  blocks on the mirror.

**Explicit non-goals (decided — do not drift):**
- NO merge of the files and artifacts storage — unify the ADDRESSING, not the stores.
- NO goals/phases table merge or migration (see LINKED decision).
- NO standing per-task AgentController in this plan. The task row IS the durable
  session state; runs stay ephemeral controllers. The genuine future win —
  interactive "talk to this task's agent" via Mastra scoped sessions (get-or-create
  on `(resourceId, scope)`, 1.51+) — is deferred until the 1.52 upgrade train has
  settled (a parallel-approval regression fix is still pending live verify as this
  plan is written).
- NO new pgmq queues, statuses, or run mechanics.

## 2. Current wiring (read before coding)

- Artifact store + scopes: `apps/core/supabase/migrations/20260713163800_ai_artifacts.sql`
  (`scope_type` CHECK `('thread','task','project','goal')` — the hierarchy's tiers
  minus routine; routine visibility rides thread→task→trigger edges, no new scope
  value needed). DAL `apps/ai/src/dal/artifacts/artifact-store.ts` (`listByScope`,
  `updateScope`). Tools `apps/ai/ai/tools/artifact-tools.ts` (thread-born only,
  copilot-only today). UI `packages/ai-ui/src/artifacts/` + catalog page.
- Thread→task edge: `task_runs.agent_session_run_id` (= workflow runId) →
  `ai.agent_run.thread_id` (`modules/tasks/src/dal/supabase.ts:1636` enrichment shows
  the join); also `ai.thread.route_context.task_id` stamped by
  `apps/ai/src/ai/jobs/task-job-run-record.ts:45-58`.
- Workspace presets + mounts: `apps/ai/src/ai/workspace/workspace-presets.ts`
  (`/home`, `/shared`→`ai/workspace/commons/`, `/skills`, `/task` with
  `requireBinding` + source `checkout`), binding resolution
  `apps/ai/src/ai/sessions/session-service.ts:355-414` (interactive path ONLY),
  loader `apps/ai/src/ai/workspace/loader.ts`.
- Headless gap — PARTIALLY CLOSED by the routine plan (2026-07-24, uncommitted):
  `task-job-specialist-step.ts` now injects scoped HTTP-storage file tools
  (`workspace_read_file`/`workspace_write_file`, `apps/ai/ai/tools/workspace-files/`)
  as `extraTools`, with `allowedPrefixes` = routine prefix (when `trigger_id`) +
  task prefix. Still NO mounted Workspace/sandbox on headless runs
  (`runDelegatedConversation` accepts both — `delegate-run.ts`), no goal/shared
  access, no artifact tools. Phase 3 builds on the shipped tool surface.
- Task workspace prefix machinery: `modules/tasks/src/lib/task-workspace.ts` +
  `ensure-task-workspace-prefix.ts` + `perform-task-checkout.ts`. The routine plan
  added THREE more prefix builders Phase 1 must absorb:
  `modules/tasks/src/lib/routine-workspace.ts` (+ `ensure-routine-workspace-prefix.ts`),
  an inlined copy in `apps/ai/src/ai/jobs/routine-continuity.ts` (apps/ai avoids a
  build-dep on the tasks module — but it CAN import `@engenty/file-storage`), and a
  hardcoded task-prefix template string in `task-job-specialist-step.ts`.
- Dependency wake (no info transfer): `modules/tasks/src/api/task-dispatch-service.ts:99-137`
  — dependent gets only a `tasks.blockers_resolved` activity row; briefs render
  comments, not activity (`apps/ai/src/ai/jobs/task-brief.ts`).
- Brief contents: `task-brief.ts` — title/description/contexts/own-comments; routine
  tasks additionally get a "## Routine workspace" section + run protocol + a
  10-comment cap (shipped with the routine plan). Still NO goal section — Phase 3's
  "## Goal context" should follow the same section pattern.

## Phase 1 — The convention as code (pure functions, single source of truth)

New file `packages/file-storage/src/work-workspace.ts` (exported from the package;
`@engenty/file-storage` already owns tenant key helpers and has no DAL deps):

```ts
import { fileStorageTenantObjectKey } from "./keys.js"; // existing helper

/** Tiers that own a durable workspace folder. Thread deliberately has none —
 * a thread's durable output is artifacts; scratch belongs to its task. */
export type WorkContainerTier = "task" | "routine" | "goal" | "project" | "global";

const TIER_SEGMENT: Record<WorkContainerTier, string> = {
  global: "commons",        // absorbs the existing /shared prefix — unchanged bytes
  goal: "goals",
  project: "projects",
  routine: "routines",
  task: "tasks",
};

/** `tenants/<t>/ai/workspace/<segment>/<id>/` — global ignores the id. */
export function workWorkspacePrefix(
  tenantId: string,
  tier: WorkContainerTier,
  id?: string
): string {
  const segment = TIER_SEGMENT[tier];
  return tier === "global"
    ? `${fileStorageTenantObjectKey(tenantId, "ai", "workspace", segment)}/`
    : `${fileStorageTenantObjectKey(tenantId, "ai", "workspace", segment, requireId(tier, id))}/`;
}
```

- `modules/tasks/src/lib/task-workspace.ts` keeps its exports as thin wrappers over
  this (task identifier stays the task segment id — existing prefixes must not move).
- `COMMONS_STORAGE_PREFIX` in `workspace-presets.ts` is re-exported from here so the
  bytes stay where they are — absorption, not migration.
- **Status 2026-07-24:** the routine plan shipped its own prefix code before this
  phase ran. Phase 1 is now an absorption of FOUR call sites, all producing the same
  shapes (task tier keyed by IDENTIFIER, routine tier by trigger UUID — the helper
  must accept both, don't assume uuid):
  1. `modules/tasks/src/lib/routine-workspace.ts` → thin wrapper, exactly like
     task-workspace.ts (keep its `triggerIdFromRoutineStoragePrefix` parse helper).
  2. `apps/ai/src/ai/jobs/routine-continuity.ts` → delete its inlined
     `routineWorkspaceStoragePrefix`, import from `@engenty/file-storage` (keep
     `routineEntityRef` — memory ref, not storage).
  3. `task-job-specialist-step.ts` hardcoded task prefix → `workWorkspacePrefix(t,
     "task", identifier)`.
  4. `workspace-presets.ts` commons constant (as planned above).

**Checklist**
- [ ] Helper + tests (every tier, global without id, id validation, round-trip parse).
- [ ] task-workspace.ts AND routine-workspace.ts delegate; existing prefix strings
      byte-identical (test against the shipped literals, incl. the routine `.keep`).
- [ ] routine-continuity.ts + specialist-step use the helper (grep: no remaining
      `ai/workspace/` template literals outside file-storage).
- [ ] Package export map + tsup entry.

## Phase 2 — The container resolver (one choke point for "what's inside X")

New `apps/ai/src/ai/work-scope/resolve-work-container.ts` (apps/ai because it can see
both `ai.*` and module ops):

```ts
export interface WorkContainerRef { tier: WorkContainerTier | "thread"; id: string; }

export interface ResolvedWorkContainer {
  artifactScopes: Array<{ scope_type: string; scope_id: string }>; // for ai.artifact IN-query
  taskIds: string[];
  threadIds: string[];
  workspacePrefixes: string[];
}

/** Walk containment edges DOWN from a container to its contents. */
export async function resolveWorkContainer(
  deps: { invoke: ModuleOpInvoker; agentRuns: AgentRunReader },
  ref: WorkContainerRef
): Promise<ResolvedWorkContainer> { /* per tier: */ }
```

Resolution rules (each tier includes its own scope plus everything below):
- **task** → own scope + threads of its runs (`task_runs → ai.agent_run.thread_id`;
  fallback `ai.thread.route_context.task_id`).
- **goal** → own scope + `tasks_list {goal_id}` → each task's resolution.
- **routine** → `tasks_list {trigger_id}` (the standing task + prior generations) →
  each task's resolution. (No `routine` artifact scope value exists — none needed.)
- **project** → own scope + goals of the project + tasks with `project_id` → recurse.
  Phases are NOT resolved here (LINKED decision: phase lanes are a projects-UI
  concern; phase tasks reachable via the project's task set).
- **global** → no filter (the catalog).

Caps and honesty: page task lists (200 hard cap, log when hit — no silent truncation),
memoize per-request. This resolver is the ONLY place containment logic lives — UI
routes and agent context both call it.

**Checklist**
- [ ] Resolver + unit tests per tier (incl. goalless routine task, parentless thread).
- [ ] HTTP: `GET /ai/artifacts?container=<tier>:<id>` — extend the existing list
      route (`apps/ai/src/api/artifact-routes.ts:91`) to accept a container param and
      IN-query over `resolveWorkContainer(...)`.artifactScopes. Existing scope params
      keep working (back-compat).
- [ ] Files: same container param on the workspace listing route
      (`apps/ai/src/api/workspace-routes.ts`) returning the prefixes' listings.

## Phase 3 — Mount the hierarchy into headless specialist runs (the keystone)

**Status 2026-07-24:** the routine plan already shipped the ACCESS PATH — scoped
`workspace_read_file`/`workspace_write_file` tools (`apps/ai/ai/tools/workspace-files/`)
injected per-run with `allowedPrefixes` (routine + task). Phase 3 EXTENDS that shipped
surface instead of building filesystem mounts; a real Workspace mount stays optional
for sandbox-declaring agents only (the tools already give durable read/write over
HTTP storage, which is all containment needs).

- Extend `allowedPrefixes` in `task-job-specialist-step.ts`: `/goal` prefix
  (`workWorkspacePrefix(t,"goal",goal_id)`) when `goal_id` is set (the envelope must
  carry `goal_id` — add it, optional, like `trigger_id`), + the global commons prefix.
  Order stays "most specific first" (routine → task → goal → commons) — relative
  paths resolve into the FIRST prefix, and the tool descriptions must say so.
  Bootstrap the goal `.keep` on first write (same idempotent pattern as
  `ensure-routine-workspace-prefix.ts` — or lazily in the write tool, simpler).
- Add a `workspace_list_files` sibling tool (prefix-scoped listing) — read/write
  without list makes cross-run discovery guesswork.
- Sandbox: unchanged — pass `sandboxProvider` only for agents whose config declares
  one. Real `/task`-style mounts for headless runs are a follow-up only if a
  specialist actually needs a filesystem (code execution), not for storage access.
- **Artifact tools for specialists:** add `createArtifactTools()` to the task-job
  toolset (today copilot-only — `copilot-agent.ts:54`). Artifacts are born on the
  run's thread; containment (Phase 2) makes them task/goal/project-visible with NO
  promotion step. Brief gains two lines in `buildTaskBrief`: durable outputs →
  `artifact_create`; files → the mounted folders (`/task` scratch, `/goal` shared
  with sibling tasks, `/routine` carried across runs).
- Brief gains a "## Goal context" section when `goal_id` is set: goal title + status
  + open sibling task titles (capped ~10 one-liners) — the cheap half of "seeing each
  other"; fetched in `buildBriefStep` where the invoker already exists.

**Checklist**
- [ ] Envelope gains optional `goal_id` (in-flight snapshots must parse — same rule
      as `run_disposition`); dispatch/checkout populates it.
- [ ] `allowedPrefixes` extended (goal + commons) + `workspace_list_files` tool +
      prefix-order documented in the tool descriptions; key-scope tests extended
      (goal prefix accepted, foreign goal rejected).
- [ ] Artifact tools in task-job toolset (today copilot-only); `requireThreadScope`
      satisfied by the run thread (verify: the task-job ALS context carries the
      thread — it does, `threadIdForRun`).
- [ ] Brief sections: "## Goal context" + workspace guidance for NON-routine tasks
      too (the tools are attached to every task job, but only routine briefs mention
      them today — close that gap).
- [ ] E2E: specialist writes a goal-prefix file, sibling task's run reads it;
      artifact created in run → visible on task panel with zero promotion writes.

## Phase 4 — Dependency edges carry information

`wakeBlockedDependents` (`task-dispatch-service.ts:99-137`): when the last blocker
resolves, copy the blocker's result onto the dependent as a COMMENT (comments reach
briefs; activity does not):

```ts
// inside the dependents loop, after the status flip, before dispatch
const resultComment = await deps.repo.getLatestAgentResultComment(doneTask.id); // "🤖 …"
await deps.repo.addComment(
  dep.id,
  `Blocker ${doneTask.identifier ?? doneTask.id} completed: ${truncate(resultComment ?? doneTask.title, 1500)}`,
  { createdByAgentTypeKey: COORDINATION_ACTOR }
);
```

**Checklist**
- [ ] New DAL read (latest 🤖-prefixed comment of a task) + truncation cap + test.
- [ ] Comment lands BEFORE `enqueueTaskDispatch` (the woken run's brief must include it).
- [ ] Multi-blocker case: one comment per resolved blocker, not one per wake sweep.

## Phase 5 — UI: five filtered views of one catalog

- **One component:** generalize the existing artifacts panel
  (`packages/ai-ui/src/artifacts/`, task panel `modules/tasks/ui/components/
  task-artifacts-panel.tsx`) into a `WorkPanel` taking a `container` ref — tabs
  Artifacts | Files, backed by the Phase 2 container param. Task detail, goal detail,
  routine detail, project tab all mount the SAME component. Delete the per-surface
  fetch variants as they are replaced (count them in the commit message).
- **Goal page:** the Work panel + the planning feedback section (already specced in
  the harness-hardening discussion) make the goal the aggregation surface the mental
  model promises.
- **Project page:** present project-linked goals as phase-like lanes alongside
  `project_phases` lanes (LINKED decision — presentation only; a goal lane links to
  the goal detail).
- **Global:** the existing artifacts catalog page + a commons file browser entry are
  the Global tier; no new page.
- **Pin, not promote:** `artifact_store` UI copy changes from "Store to task/goal"
  to "Pin" (sets scope as today; visibility never depends on it anymore). API
  unchanged — semantic demotion only.

**Checklist**
- [ ] WorkPanel + container prop; four mounts; deleted duplicates enumerated.
- [ ] Manual `tsc --noEmit` on touched `ui/` files (or the hardening plan's Phase 5
      gate if landed); `pnpm --filter @engenty/ai-ui build` before module UI work.
- [ ] Realtime: `ai.artifact` is in the publication — panel refetches on events.

## Phase 6 — Absorption + deferred

- **Vault deprecation:** `vault_upload_file`/`vault_list_files`/`vault_get_file_url`
  (`apps/ai/ai/tools/vault-files/`) overlap workspace writes once mounts exist.
  Deprecate: copilot keeps them read-only for old links one release, new writes go to
  `/home` or `/shared`; then remove the tools. Separate commit, skippable.
- **Deferred — interactive task sessions:** "talk to this task's agent" via Mastra
  scoped sessions (`(resourceId=task, scope)` get-or-create), sharing the task's run
  threads. Revisit after the 1.52 train (incl. the pending parallel-approval
  regression fix) is released and stable.
- **Mirror follows versions:** `mirrorArtifactToBoundStorage` currently fires only
  on promote and never re-mirrors later edits (documented follow-up in
  `docs/wip/artifacts-implementation.md`). With pin = curation (§1b), extend
  `addVersion` in `artifact-store.ts` to re-mirror best-effort when the artifact's
  container has a binding and the artifact is pinned there. Failures log; the
  platform write never blocks.
- **Deferred — connector mounts at container tiers:** external folders
  (Drive/S3) already mount into file spaces; binding them per-goal/project reuses
  `ai.artifact_storage_binding`-style scoping but is NOT needed for the model to
  work. Do nothing now.

## Interplay with the other plans (status 2026-07-24: both implemented)

- `PLAN-harness-hardening.md` LANDED (v0.1.72: Mastra 1.52 schedules rename, queue
  at-least-once, dispatch rails, UI typecheck gate). The typecheck gate exists now —
  use it for Phase 5 UI work instead of manual `tsc`.
- `PLAN-routine-scheduled-specialist.md` IMPLEMENTED (uncommitted at time of
  writing). Its Phase 4 shipped a LOCAL routine prefix + scoped file tools instead of
  waiting for this plan — see the Phase 1 absorption list and the Phase 3 status
  note above. Routine detail UI shipped its own runs section + workspace strip;
  Phase 5's WorkPanel absorbs the strip when it lands (runs section stays).
- The goal "Planning" feedback section discussed separately slots into Phase 5 here
  (hardening is closed — this plan is now its only home).
- The §8 "auto-promote in finalizeStep" idea from the deep-dive artifact is
  SUPERSEDED by containment (Phase 2+3). Do not implement it.
## Acceptance (plan done when)

1. One prefix convention serves task/routine/goal/project/global; existing task and
   commons bytes unmoved. (Phase 1)
2. "What's inside X" is answered by exactly one resolver, used by both the artifact/
   file routes and agent context. (Phase 2)
3. A headless specialist run can read/write/list its task, goal (when linked),
   routine (when linked), and commons workspace prefixes via the scoped workspace
   tools, has artifact tools, and a goal-context brief section; an artifact created
   mid-run appears on the task page with no promotion write. (Phase 3)
4. A woken dependent's brief contains its blocker's result. (Phase 4)
5. Task/goal/routine/project surfaces render the SAME work panel; a goal shows its
   tasks' and threads' artifacts; a project shows goal lanes beside phase lanes. (Phase 5)
6. Zero migrations; touched packages' test suites green before any release.

## Standing gotchas

- tsx watch does not restart core on module edits → `touch apps/core/src/api-entry.ts`.
- `modules/tasks` op-list test asserts the exact op set — update with any op change.
- Module UI typecheck gate landed with hardening Phase 5 (v0.1.72) — run it; manual
  `tsc` no longer required.
- Envelope schema fields must stay optional (in-flight snapshots must parse).
- Never `git add -A` in the shared checkout.
