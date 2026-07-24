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
- Headless gap: `apps/ai/src/ai/jobs/task-job-specialist-step.ts` passes NO
  workspace/sandbox to `runDelegatedConversation` (which accepts both —
  `delegate-run.ts:92-97`). Header comment: "/task filesystem workspace mount is a
  planned follow-up" — this plan IS that follow-up.
- Task workspace prefix machinery: `modules/tasks/src/lib/task-workspace.ts` +
  `ensure-task-workspace-prefix.ts` + `perform-task-checkout.ts`.
- Dependency wake (no info transfer): `modules/tasks/src/api/task-dispatch-service.ts:99-137`
  — dependent gets only a `tasks.blockers_resolved` activity row; briefs render
  comments, not activity (`apps/ai/src/ai/jobs/task-brief.ts`).
- Brief contents: `task-brief.ts` — title/description/contexts/own-comments only; no
  goal section at all.

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
- Routine plan Phase 4's `routineWorkspaceStoragePrefix` is DELETED from that plan's
  scope — it becomes `workWorkspacePrefix(t, "routine", triggerId)`.

**Checklist**
- [ ] Helper + tests (every tier, global without id, id validation, round-trip parse).
- [ ] task-workspace.ts delegates; existing prefix strings byte-identical (test).
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

Close the "planned follow-up" in `task-job-specialist-step.ts`: build a Workspace for
the delegated run from the EXISTING preset/loader machinery (reuse
`session-service.ts:355-414`'s binding path — extract, don't duplicate):

- Mounts for a task-job run: `/task` (rw, task prefix — binding = the checked-out
  task's identifier, which checkout already ensures exists), `/goal` (rw,
  `workWorkspacePrefix(t,"goal",goal_id)`) when `goal_id` is set, `/routine` (rw,
  routine prefix) when `trigger_id` is set, `/shared` (rw, global commons), `/skills`
  (ro). Bootstrap goal/routine `.keep` on first mount (same idempotent pattern as
  `ensure-task-workspace-prefix.ts`).
- Sandbox: not required for mounts to work as tool-accessible storage; pass
  `sandboxProvider` only for agents whose config declares one (unchanged behavior).
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
- [ ] Extracted mount-builder shared by session-service (interactive) and
      specialist-step (headless) — one implementation, two callers.
- [ ] Specialist-step passes `workspace` (+ provider teardown handled — reuse
      `destroyRunSandboxes` path in delegate-run, already wired at `:391-395`).
- [ ] Artifact tools in task-job toolset; `requireThreadScope` satisfied by the run
      thread (verify: the task-job ALS context carries the thread — it does,
      `threadIdForRun`).
- [ ] Brief sections (goal context + output guidance) behind their guards + tests.
- [ ] E2E: specialist writes `/goal/notes.md`, sibling task's run reads it; artifact
      created in run → visible on task panel with zero promotion writes.

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
- **Deferred — connector mounts at container tiers:** external folders
  (Drive/S3) already mount into file spaces; binding them per-goal/project reuses
  `ai.artifact_storage_binding`-style scoping but is NOT needed for the model to
  work. Do nothing now.

## Interplay with the other plans (apply these amendments when starting them)

- `PLAN-routine-scheduled-specialist.md` Phase 4 (routine workspace): replace its
  local `routineWorkspaceStoragePrefix` with `workWorkspacePrefix(t,"routine",id)`
  (Phase 1 here) and its "verify specialist write tool" item with Phase 3's mounts —
  the phases otherwise stand.
- `PLAN-harness-hardening.md`: unchanged; its Phase 1 (Mastra rename) precedes this
  plan. The goal "Planning" feedback section discussed separately slots into Phase 5
  here or as hardening Phase 7 — either, not both.
- The §8 "auto-promote in finalizeStep" idea from the deep-dive artifact is
  SUPERSEDED by containment (Phase 2+3). Do not implement it.

## Acceptance (plan done when)

1. One prefix convention serves task/routine/goal/project/global; existing task and
   commons bytes unmoved. (Phase 1)
2. "What's inside X" is answered by exactly one resolver, used by both the artifact/
   file routes and agent context. (Phase 2)
3. A headless specialist run has `/task`, `/goal` (when linked), `/routine` (when
   linked), `/shared` mounted, artifact tools, and a goal-context brief section; an
   artifact created mid-run appears on the task page with no promotion write. (Phase 3)
4. A woken dependent's brief contains its blocker's result. (Phase 4)
5. Task/goal/routine/project surfaces render the SAME work panel; a goal shows its
   tasks' and threads' artifacts; a project shows goal lanes beside phase lanes. (Phase 5)
6. Zero migrations; touched packages' test suites green before any release.

## Standing gotchas

- tsx watch does not restart core on module edits → `touch apps/core/src/api-entry.ts`.
- `modules/tasks` op-list test asserts the exact op set — update with any op change.
- Module UI has no typecheck gate until hardening Phase 5 lands — manual `tsc` on
  touched files.
- Envelope schema fields must stay optional (in-flight snapshots must parse).
- Never `git add -A` in the shared checkout.
