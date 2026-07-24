# PLAN — Promote routines from task templates to scheduled specialists

**Status:** planned · 2026-07-24
**Decision basis:** architecture deep-dive (claude.ai artifact `dfb53e58`), Open question 1, position C:
> A routine IS a scheduled agent that files its work as reviewable tasks.

**Work mode:** directly on `main` (no schema migrations in this plan — see "Why zero migrations" below). Mastra deps are being bumped to `@mastra/core@1.52.1` in a parallel effort; see Phase 0 for the one real coordination point.

---

## 1. The idea in one paragraph

Today a routine is a *stateless task factory*: a `triggers` row (`kind='schedule'` + cron)
pointing at a `task_template`; every fire stamps a task, the task hosts the run, and the
routine itself remembers nothing, owns nothing, and shows nothing. What people call an
"agent" is **identity + instructions + memory + workspace + runs**. A routine already has
identity (the trigger row), instructions (ROUTINE.md body on `trigger.description`), and a
schedule. This plan adds the missing three — **memory, workspace, visible runs** — *without*
changing the execution model: fires still create tasks, tasks still ride
`agent_task_dispatch` → the `task-job` workflow, humans still review at `in_review`. We are
promoting the routine's *continuity*, not building a second engine.

**Explicit non-goals** (decided, do not drift into these):
- NO adoption of Mastra `DurableAgent` (unwired scaffold today; crash-durability stays
  workflow-snapshot-based).
- NO adoption of AgentController `modes`/`submit_plan` (native approval gate is
  deliberately OFF via `yolo:true` — `apps/ai/src/ai/conversation/controller-session.ts:10`).
- NO new pgmq queue, no routine-runs-outside-tasks, no schema change to `triggers`.
- Task remains the review + durability host. A routine that "runs without a task" is
  out of scope and against the design.

## 2. Why zero migrations

Everything hangs off `trigger_id`, which already exists everywhere we need it:

| Need | Derivation (no new column) |
|---|---|
| Routine identity | the `triggers` row itself (`module_tasks.triggers.id`) |
| Memory scope | memory module's existing `entity` scope with `scope_ref = "tasks.routine:<trigger_id>"` (`modules/memory/src/schema/zod.ts:3-9` — `entity` is already a valid `scope_kind`; `scope_ref` is free-form `<type>:<id>`) |
| Workspace prefix | sibling of the existing task workspace: `tenants/<t>/ai/workspace/routines/<trigger_id>/` (task version: `modules/tasks/src/lib/task-workspace.ts`) |
| Run history | `tasks.trigger_id` (indexed, migration `20260722170000`) joined to `task_runs` — the DAL partial `listOpenTriggerTasks` already exists (`modules/tasks/src/dal/supabase.ts:1603`) |

If during implementation you find yourself writing a migration, stop and re-read this
section — you are probably rebuilding something that exists.

## 3. Current wiring (read these before coding)

- Fire path: `modules/tasks/src/api/trigger-fire.ts` — stacking guard L91-101, task
  creation L102-117 (`trigger_id` stamped), `recordTriggerFire` L118.
- Brief assembly: `apps/ai/src/ai/jobs/task-job-steps.ts` `buildBriefStep` L112-176 —
  fetches the trigger (for `approval_grants`) at L143-151, prior learnings at L160-165.
- Prior learnings: `apps/ai/src/ai/jobs/task-prior-learnings.ts` — already queries
  `project`/`entity`/`org` scopes via `memory_record_list`; fail-open, char-capped.
- Reflection: `apps/ai/src/ai/jobs/task-job-reflect-step.ts` — opt-in
  (`ENGENTY_AI_MEMORY_REFLECTION=true`), same specialist, memory tools only, 120s cap.
- Task workspace: `modules/tasks/src/lib/task-workspace.ts` +
  `ensure-task-workspace-prefix.ts` (idempotent `.keep` bootstrap at checkout via
  `perform-task-checkout.ts`); UI strip `modules/tasks/ui/components/task-workspace-strip.tsx`.
- Routine DTO/UI: `packages/ai-ui/src/features/routines/routines-api.ts` (`RoutineDto`,
  `toRoutineDto`), `modules/tasks/ui/components/routine-detail-sections.tsx` (the dead
  "View run details" link at ~L159 — gated on `routine.thread_id` which does not exist).
- Scheduler: `apps/ai/src/scheduler/heartbeat-sync.ts` (`reconcileScheduler` L118-263 —
  note L153-155 skips existing triggers entirely), `heartbeat-hooks.ts` (fire via
  `prepare()` hook, returns null — no agent run from the heartbeat itself).

---

## Phase 0 — Coordination gates (no code in this plan)

1. **Mastra 1.52 rename.** `apps/ai/package.json` already pins `@mastra/core@1.52.1`
   (uncommitted), but `apps/ai/src/scheduler/heartbeat-sync.ts` still calls
   `mastra.heartbeats.*` — removed in 1.50 in favor of `mastra.schedules.*`
   (`Heartbeat`→`AgentSchedule`, `/api/heartbeats/*`→`/api/schedules/*`, fire-signal tag
   `<heartbeat>`→`<schedule>`). Whoever lands the upgrade owns that rename. **This plan
   only touches the scheduler in Phase 1 (reconcile fix)** — if the rename hasn't landed
   when you start, write Phase 1 against the current `heartbeats` names and note it in
   the PR-less commit message; the rename is mechanical either way.
2. Do not start Phase 4 (UI) while `modules/tasks/ui` remains un-typechecked without
   running the Phase 4 checklist's manual `tsc` spot-check — the dead-link bug shipped
   exactly this way.

## Phase 1 — Instructions are the mandate: make ROUTINE.md reconcile

**Problem:** `reconcileScheduler` seeds a module routine once and then skips it forever
(`heartbeat-sync.ts:153-155`), so ROUTINE.md edits never reach tenants — contradicting
its own docstring ("template content follows the declaration"). For a routine to be a
specialist's mandate, the mandate must follow the source.

**Change** (in `apps/ai/src/scheduler/heartbeat-sync.ts`): for an *existing* trigger
matched by `module_id:module_key`, update the **declaration-owned** fields when they
drifted, and leave the **user-owned** fields alone.

- Declaration-owned: `trigger.description` (ROUTINE.md body), `task_template.title`,
  `task_template.description`, `task_template.agent_type_key`, `task_template.priority`.
- User-owned (NEVER touch on reconcile): `enabled`, `cron`, `timezone`, `quiet_hours`,
  `approval_grants`.

```ts
// heartbeat-sync.ts — inside the declaration loop, replacing the plain `continue`
const existing = existingByKey.get(declKey(declaration));
if (existing) {
  const desired = {
    description: declaration.instructions ?? null, // ROUTINE.md body
    template: {
      agent_type_key: declaration.target.agent_type_key,
      description: declaration.target.description ?? null,
      priority: declaration.target.priority ?? "medium",
      title: declaration.target.title,
    },
  };
  if (routineDeclarationDrifted(existing, desired)) {
    await invoke("triggers_update", {
      description: desired.description,
      id: existing.id,
      task_template: desired.template, // extend the op if it doesn't take a nested template yet
    }).catch((error) => logger.error("routine reconcile update failed", { error }));
  }
  continue; // still no create
}
```

`routineDeclarationDrifted` is a pure helper (new file
`apps/ai/src/scheduler/routine-declaration-drift.ts`) comparing the five
declaration-owned fields after `trim()`. Pure function → trivially unit-testable.

**Gotchas:** `triggers_update` caps `description` at `TRIGGER_DESCRIPTION_MAX = 16_000`
(raised for exactly this ROUTINE.md-in-description case); the reconcile loop already has
per-item try/catch isolation — keep the update inside it.

**Checklist**
- [ ] `routine-declaration-drift.ts` + unit test (drifted / not-drifted / whitespace-only).
- [ ] Reconcile updates description + template on drift; skips when identical.
- [ ] `enabled=false` + custom `cron` survive a reconcile with a changed ROUTINE.md
      (test this explicitly — it is THE regression risk of this phase).
- [ ] If `triggers_update` can't update the nested template today, extend the op input
      schema (zod) + DAL + **update the op-list test**
      `modules/tasks/src/api/index.test.ts` (bitten twice before).
- [ ] Manual: edit `modules/engenty-coordinator/ai/routines/heartbeat/ROUTINE.md`, boot
      core+ai, confirm `trigger.description` changed and `enabled/cron` didn't.
- [ ] `touch apps/core/src/api-entry.ts` after module edits (tsx watch doesn't see
      jiti-loaded module sources).

## Phase 2 — Routine memory: run N+1 starts from what run N learned

Convention (write it as a constant, both sides import it):

```ts
// modules/tasks/src/lib/routine-ref.ts  (exported from the package like task-workspace)
export const ROUTINE_ENTITY_TYPE = "tasks.routine";
export function routineEntityRef(triggerId: string): string {
  return `${ROUTINE_ENTITY_TYPE}:${triggerId}`;
}
```

**2a — inject at brief time.** `buildBriefStep` already has `taskRow.trigger_id` in hand
*before* it calls `buildPriorLearningsSection` (`task-job-steps.ts:143` vs `:160`). Add the
routine ref to the entity refs:

```ts
// task-job-steps.ts, buildBriefStep
const learnings = await buildPriorLearningsSection({
  agentTypeKey: inputData.agent_type_key,
  contexts,
  entityRefs: [
    ...entityRefsFromContexts(contexts),
    ...(taskRow.trigger_id ? [routineEntityRef(taskRow.trigger_id)] : []),
  ],
  invoke,
});
```

No change needed inside `task-prior-learnings.ts` — the `entity` branch (L104-115)
already queries `memory_record_list({scope_kind:"entity", scope_ref})`. Bump the
per-entity limit for the routine ref only if real usage shows 5 is too few; don't
pre-tune.

**2b — save at reflection time.** `buildReflectionPrompt`
(`task-job-reflect-step.ts:31`) gets the target scope appended when the run came from a
routine (the envelope carries `trigger_id` since the durable-approvals train):

```ts
// task-job-reflect-step.ts — extend buildReflectionPrompt input with trigger_id
...(input.trigger_id
  ? [
      "",
      `This run belongs to a recurring routine. Save routine-specific lessons with scope_kind 'entity' and scope_ref '${routineEntityRef(input.trigger_id)}' so the NEXT run of this routine starts from them.`,
    ]
  : []),
```

Keep the anti-hoarding framing of the existing prompt untouched — the bias against
saving is deliberate.

**2c — surface it.** Routine detail gets a read-only "Memory" section listing active
`entity`-scoped records for `routineEntityRef(id)` via the existing memory list op, with
a link to `/settings/memory` for editing. Reuse the doc-list rendering from the memory
settings UI rather than building a new editor.

**Checklist**
- [ ] `routine-ref.ts` + export map entry in `modules/tasks/package.json` (mirror the
      `./lib/task-workspace` entry) + tsup entry list.
- [ ] Brief injection behind `taskRow.trigger_id` guard; unit test in
      apps/ai (`task-prior-learnings` tests show the pattern; new test asserts the
      routine ref is passed through).
- [ ] Reflection prompt extension + test (prompt contains scope line iff trigger_id).
- [ ] Reminder: reflection is env-gated OFF (`ENGENTY_AI_MEMORY_REFLECTION`) — Phase 2
      is still correct to land; note in the routine Memory section UI when reflection
      is disabled ("agents currently don't auto-save; add memories manually").
- [ ] E2E (dev, reflection ON, single-tenant JWT matching the tenant —
      `node scripts/mint-service-jwt.mjs --tenant <id>` gotcha): fire coordinator
      heartbeat twice; run 1 saves a lesson, run 2's brief contains it.

## Phase 3 — Routine workspace: a durable folder the routine keeps between runs

Mirror the task workspace exactly (same bucket, sibling prefix). A routine's task runs
get BOTH prefixes: the task's own scratch (per-run) and the routine's durable folder
(cross-run).

```ts
// modules/tasks/src/lib/routine-workspace.ts (mirror task-workspace.ts)
export function routineWorkspaceStoragePrefix(tenantId: string, triggerId: string): string {
  return fileStorageTenantObjectKey(tenantId, "ai", "workspace", "routines", triggerId) + "/";
}
```

- **Bootstrap:** in `performTaskCheckout` (`modules/tasks/src/lib/perform-task-checkout.ts`),
  when the task has a `trigger_id`, also `ensureRoutineWorkspacePrefix(...)` (same
  idempotent `.keep` policy as `ensure-task-workspace-prefix.ts` — copy the exists-check
  + zero-byte upload, fail-open).
- **Tell the agent:** `buildTaskBrief` (`apps/ai/src/ai/jobs/task-brief.ts`) gains a
  short section when `trigger_id` is set:

  ```
  ## Routine workspace
  This task is a run of a recurring routine. Its durable folder is
  `ai/workspace/routines/<trigger_id>/` — read state left by previous runs there,
  and write anything the NEXT run should find (state files, checklists, reports).
  ```

- **Write access — verify, don't assume:** the task workspace strip lists bucket
  objects by prefix, but confirm which tool the *specialist* actually has for writing
  to the `files` bucket (the artifacts audit found vault tools are copilot-only and
  native `file_entries` have no agent ops). If the specialist has no storage write
  tool: add a minimal pair `workspace_read_file` / `workspace_write_file` scoped to the
  two allowed prefixes (task + routine) — key validation server-side against
  `taskWorkspaceStoragePrefix`/`routineWorkspaceStoragePrefix`, reject anything else.
  Wire them into the task-job tool set only (not the copilot).
- **Surface it:** routine detail page reuses the `TaskWorkspaceStrip` pattern with the
  routine prefix (`modules/tasks/ui/components/task-workspace-strip.tsx` → extract or
  parameterize; strip links to `/mdl/files?prefix=…`).

**Checklist**
- [ ] `routine-workspace.ts` + tests (prefix shape, parse round-trip) + package export.
- [ ] Checkout bootstrap behind `trigger_id` guard, fail-open, idempotent re-run test.
- [ ] Brief section behind `trigger_id` guard (task-brief test update).
- [ ] Tool audit: name the exact tool the specialist uses to write the prefix; if
      adding `workspace_*` tools — server-side prefix validation tests (path traversal:
      `../`, absolute keys, foreign tenant prefix all rejected).
- [ ] Routine detail workspace strip renders; empty state says "no files yet".
- [ ] E2E: routine run writes `state.md`, next run's agent reads it (verify in thread log).

## Phase 4 — Runs belong to the routine (kills the "detached" feeling)

**4a — DAL + API.** New `listTriggerTaskRuns(triggerId, {limit})` in
`modules/tasks/src/dal/supabase.ts`: tasks where `trigger_id = X` ordered
`created_at desc` (limit default 20), each enriched with its latest `task_runs` row +
`ai.agent_run` join **reusing the existing `listTaskRuns` enrichment** (`supabase.ts:1636`
— reuse it precisely because its column-name mismatches already bit twice; do not write
a fresh select). Expose as gateway op `triggers_list_runs` (read-only,
`requiresApproval:false`) + REST on the existing trigger routes
(`apps/ai/src/api/trigger-routes.ts` proxies to module ops — follow the pattern of
`triggers_get`).

**4b — DTO + hook.** `packages/ai-ui/src/features/routines/routines-api.ts`: new
`RoutineRunDto` (`task_id`, `identifier`, `title`, `status`, `outcome`,
`run_started_at`, `run_finished_at`, `agent_type_key`) + `listRoutineRuns(id)` +
`useRoutineRunsQuery`. Do NOT bolt runs onto `RoutineDto` — separate query, separate
loading state.

**4c — UI.** In `modules/tasks/ui/components/routine-detail-sections.tsx`:
- **Delete the dead link** (`routine.thread_id` gate — the field never existed).
- Replace the "last execution" scalar block with a **Runs** section: one row per fire →
  `{identifier} · {status/outcome badge} · {relative time} · {duration}` linking to the
  task detail (which already hosts the run log/observer). Reuse the run-card badge +
  `formatRunDuration` from the task run panel rather than re-deriving.
- `last_result` stays as a fallback line only when the runs list is empty.

**4d — stop the list inflation.** Tasks list: routine-spawned tasks
(`trigger_id != null`) get a routine chip (reuse `task-routine-property-row.tsx`'s
lookup) and a "Hide routine runs" filter toggle (default OFF — do not change default
visibility in this phase; measure complaints first). Operations tree
(`operations-tree.tsx`): group trigger-tasks under a "Routines" node instead of
dumping them into `UnplannedTasksSection`.

**Checklist**
- [ ] DAL method + test (enrichment fields present; empty list; limit).
- [ ] Op registered + **op-list test updated** (`modules/tasks/src/api/index.test.ts`).
- [ ] Route + zod schema; 404 on foreign-tenant trigger id.
- [ ] DTO/hook; `pnpm --filter @engenty/ai-ui build` BEFORE touching module UI
      (types resolve against dist, not source).
- [ ] Dead link removed; Runs section renders live + finished runs.
- [ ] Manual `tsc` spot-check over the touched UI files (`ui/` has no typecheck gate —
      this is how the dead link shipped): `pnpm --filter ./modules/tasks exec tsc --noEmit
      ui/components/routine-detail-sections.tsx …` and eyeball only NEW errors
      (pre-existing noise is known).
- [ ] Realtime: task list already subscribes to `tasks`; confirm the Runs section
      refetches on `task_runs` realtime events (both tables are in the publication).

## Phase 5 — Optional polish (separate commits, skip freely)

- **Run distillation:** `@mastra/memory@1.23` ships `Memory.summarizeThread()` — on
  finalize of a routine task, distill the run thread into a one-paragraph summary
  comment or a routine-scoped memory record. Only do this after Phase 2 proves the
  memory loop is used.
- **Schedules-API-native firing:** post-rename, 1.50+ can schedule *workflows*
  directly. Evaluate replacing the heartbeat-`prepare()`-hook indirection with a
  scheduled invocation that calls `triggers_fire`. Behavior-neutral refactor; keep the
  quiet-hours + enabled checks wherever the entry point ends up.
- **Naming:** once runs are visible on the routine, consider renaming the routine
  detail's "Prompt" field (template description) vs "Instructions" (ROUTINE.md body) —
  today both render as prose and users can't tell which one the agent obeys.

---

## Acceptance (the whole plan is done when)

1. Editing a module ROUTINE.md changes the tenant's routine instructions on next boot,
   without touching `enabled`/`cron`. (Phase 1)
2. A routine's second run demonstrably uses a lesson + a workspace file left by the
   first run. (Phases 2+3)
3. The routine detail page shows its run history with statuses and durations, each row
   deep-linking to the hosting task; the dead link is gone. (Phase 4)
4. Routine-spawned tasks are visually distinguishable and filterable in the task list;
   operations tree has a Routines group. (Phase 4d)
5. Zero new migrations; `pnpm --filter ./modules/tasks test` and
   `pnpm --filter ./apps/ai test` green; repo biome clean; **tests run BEFORE any
   release** (build+typecheck alone has burned us twice).

## Standing gotchas (collected from prior phases — read before each phase)

- tsx watch does not restart core on module edits → `touch apps/core/src/api-entry.ts`.
- Bare `vitest run` from a package globs the whole workspace; vitest substring filters
  need a trailing slash.
- `ENGENTY_AI_SERVICE_JWT` is single-tenant; mismatch = task jobs die silently in
  checkout ("dispatched tenant X does not match…").
- Never `git add -A` in the shared checkout; stage files explicitly.
- Module UI is not typechecked by CI — manual `tsc --noEmit` spot-checks on touched
  files are part of Definition of Done for any `ui/` change.
- `modules/tasks` op-list test asserts the exact gateway op set — every new op must
  update it in the same commit.
