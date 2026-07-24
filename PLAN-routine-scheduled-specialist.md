# PLAN — Promote routines from task templates to scheduled specialists

**Status:** planned · 2026-07-24 · **rev 2** (run model decided: standing task)
**Decision basis:** architecture deep-dive (claude.ai artifact `dfb53e58`), Open question 1, position C —
> A routine IS a scheduled agent that files its work as reviewable tasks.

**Rev 2 decisions (Matthias, 2026-07-24):**
1. **Run model B — one standing task per schedule routine.** Fires do NOT create new
   tasks; each fire is a new run (`task_runs` row) on the routine's single durable
   task. One history, one storage, one status. Event triggers keep per-occurrence
   tasks (each event is a distinct occurrence).
2. **Agent-decided disposition.** Not every run needs final human approval: the agent
   ends a run as *quiet* (nothing notable — suppressed entirely), *report* (worth a
   comment/FYI), or *review requested* (`in_review` + needs-input). Automatic blanket `in_review` for routine runs is removed.
3. **Heartbeat pattern.** A routine run is a *status check that may decide to work*:
   check state (comments, workspace, memory) → do small work inline → for big work,
   file a dedicated task instead of hogging the heartbeat run.

**Work mode:** directly on `main`. Still **zero schema migrations** (see below).
Mastra deps are being bumped to `@mastra/core@1.52.1` in a parallel effort; see Phase 0.

---

## 1. The idea in one paragraph

Today a routine is a *stateless task factory*: a `triggers` row (`kind='schedule'` +
cron) pointing at a `task_template`; every fire stamps a NEW task, completed runs pile
into `in_review` (the coordinator heartbeat's ROUTINE.md literally instructs the agent
to close its own previous review items — a workaround admitting the model is wrong for
chores), and the routine itself remembers nothing, owns nothing, shows nothing. What
people call an "agent" is **identity + instructions + memory + workspace + runs**. This
plan makes the routine continuous: ROUTINE.md edits follow the source (Phase 1), the
routine owns **one standing task** that hosts every run (Phase 2), remembers across
runs via the memory module (Phase 3), keeps a durable workspace folder (Phase 4), and
shows its run history (Phase 5). The execution engine is untouched: runs still ride
`agent_task_dispatch` → the `task-job` workflow → checkout/release/reaper/approvals.

Design notes an implementer should hold onto: the standing task is the stable
container, but every run gets a **fresh thread** (drillable, no compaction needed);
long-term continuity is carried by the routine's memory + workspace + capped comments,
never by an ever-growing thread; quiet runs are **fully suppressed** (run row only —
no comment, no notification).

**Explicit non-goals** (decided, do not drift into these):
- NO adoption of Mastra `DurableAgent` (unwired scaffold; crash-durability stays
  workflow-snapshot-based) and NO AgentController `modes`/`submit_plan` (native gate is
  deliberately OFF via `yolo:true` — `apps/ai/src/ai/conversation/controller-session.ts:10`).
- NO new pgmq queue; NO runs outside tasks — the standing task IS a task, so checkout,
  reaper, tool-approval parking and review all keep working unchanged.
- Tool-approval gating (`approvalPolicy:"request"`, grants, `blocked` +
  `pending_approval_operation_ids`) is UNTOUCHED — "agent decides" applies to the
  *final review* of a run, never to gated operations.

## 2. Why zero migrations

Everything hangs off `trigger_id`, which already exists everywhere we need it:

| Need | Derivation (no new column) |
|---|---|
| Routine identity | the `triggers` row itself (`module_tasks.triggers.id`) |
| **Standing task** | latest **non-terminal** task with `trigger_id = X` (indexed since `20260722170000`); terminal → create the next generation |
| Memory scope | memory module's existing `entity` scope, `scope_ref = "tasks.routine:<trigger_id>"` (`modules/memory/src/schema/zod.ts:3-9`) |
| Workspace prefix | sibling of the task workspace: `tenants/<t>/ai/workspace/routines/<trigger_id>/` |
| Run history | `task_runs` rows of the standing task — the multi-run-per-task shape has existed since day one; enrichment via existing `listTaskRuns` (`modules/tasks/src/dal/supabase.ts:1636`) |
| Run disposition | `task_runs.outcome` is unconstrained `text` — new value `completed_quiet`; envelope field is additive |

If you find yourself writing a migration, stop and re-read this section.

## 3. Current wiring (read these before coding)

- Fire path: `modules/tasks/src/api/trigger-fire.ts` — stacking guard L91-101, task
  creation L102-117, `recordTriggerFire` L118.
- Dispatch/release: `modules/tasks/src/api/task-dispatch-service.ts`,
  `task-run-now-service.ts` (the flip-to-todo + dispatch pattern Phase 2 reuses),
  `releaseTask` in `dal/supabase.ts:1466` (always resets to `todo` — Phase 2 changes
  the resting status for routine tasks).
- Finalize: `apps/ai/src/ai/jobs/task-job-steps.ts` — `writeResultStep` L180-209
  (comment per run), `finalizeStep` L215-329 (release → status → notification).
- Brief: `apps/ai/src/ai/jobs/task-brief.ts` (includes prior comments — Phase 2 caps
  this), `task-prior-learnings.ts` (memory injection), `buildBriefStep` in
  `task-job-steps.ts:112-176`.
- Reflection: `apps/ai/src/ai/jobs/task-job-reflect-step.ts` (opt-in via
  `ENGENTY_AI_MEMORY_REFLECTION=true`).
- Task workspace: `modules/tasks/src/lib/task-workspace.ts` +
  `ensure-task-workspace-prefix.ts` + `perform-task-checkout.ts`.
- Routine DTO/UI: `packages/ai-ui/src/features/routines/routines-api.ts`,
  `modules/tasks/ui/components/routine-detail-sections.tsx` (dead "View run details"
  link ~L159, gated on nonexistent `routine.thread_id`).
- Scheduler: `apps/ai/src/scheduler/heartbeat-sync.ts` (reconcile skips existing
  triggers at L153-155 — Phase 1 fixes), `heartbeat-hooks.ts`.

---

## Phase 0 — Coordination gates (no code in this plan)

1. **Mastra 1.52 rename.** `apps/ai/package.json` already pins `@mastra/core@1.52.1`
   (uncommitted) but the scheduler still calls `mastra.heartbeats.*`, which 1.50
   replaced with `mastra.schedules.*` (`Heartbeat`→`AgentSchedule`,
   `/api/heartbeats/*`→`/api/schedules/*`, signal tag `<heartbeat>`→`<schedule>`).
   Whoever lands the upgrade owns that rename; Phase 1 writes against whatever names
   are current when it starts — the rename is mechanical either way.
2. `modules/tasks/ui` has no typecheck gate — every UI phase ends with a manual `tsc`
   spot-check on touched files (the dead-link bug shipped exactly this way).

## Phase 1 — Instructions are the mandate: make ROUTINE.md reconcile

Unchanged from rev 1. `reconcileScheduler` seeds a module routine once and then skips
it forever (`heartbeat-sync.ts:153-155`), so ROUTINE.md edits never reach tenants. For
an *existing* trigger matched by `module_id:module_key`, update the
**declaration-owned** fields on drift, never the **user-owned** ones.

- Declaration-owned: `trigger.description` (ROUTINE.md body), `task_template.title`,
  `.description`, `.agent_type_key`, `.priority`.
- User-owned (NEVER touch): `enabled`, `cron`, `timezone`, `quiet_hours`,
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
      task_template: desired.template, // extend the op if needed
    }).catch((error) => logger.error("routine reconcile update failed", { error }));
  }
  continue; // still no create
}
```

`routineDeclarationDrifted` = pure helper in a new
`apps/ai/src/scheduler/routine-declaration-drift.ts`, comparing the five fields after
`trim()`.

**Checklist**
- [ ] Drift helper + unit tests (drifted / identical / whitespace-only).
- [ ] Reconcile updates on drift, still never creates duplicates.
- [ ] `enabled=false` + custom `cron` survive a reconcile with changed ROUTINE.md
      (THE regression risk — test explicitly).
- [ ] If `triggers_update` gains nested template input: zod + DAL + **op-list test**
      `modules/tasks/src/api/index.test.ts`.
- [ ] `TRIGGER_DESCRIPTION_MAX = 16_000` cap still honored; per-item try/catch kept.
- [ ] Manual: edit coordinator heartbeat ROUTINE.md → boot → description changed,
      enabled/cron untouched. (`touch apps/core/src/api-entry.ts` after module edits.)

## Phase 2 — The standing task + agent-decided disposition (run model B)

The heart of rev 2. A schedule routine owns ONE durable task; every fire re-runs it.

### 2a — Fire path: find-or-create + re-dispatch, never stack

Replace the create-per-fire in `fireTrigger` (`trigger-fire.ts`) for
`kind === "schedule"` (event fires keep the existing per-occurrence path unchanged):

```ts
// trigger-fire.ts — schedule branch
const open = await tasksRepo.listTriggerTasks(trigger.id, { nonTerminalOnly: true });
const standing = open[0] ?? null;

if (standing) {
  if (standing.checkout_run_id) {
    await triggersRepo.recordTriggerFire(trigger.id,
      `skipped — run ${standing.checkout_run_id} still active on ${standing.identifier}`);
    return standing;
  }
  if (standing.status === "in_review") {
    // Agent asked a human for review; do not clobber the ask with a new run.
    await triggersRepo.recordTriggerFire(trigger.id,
      `skipped — ${standing.identifier} awaits human review`);
    return standing;
  }
  if (standing.status === "blocked") {
    // Approval-parked or dependency-blocked; approvals re-dispatch on grant.
    await triggersRepo.recordTriggerFire(trigger.id,
      `skipped — ${standing.identifier} is blocked`);
    return standing;
  }
  // Resting (backlog/todo): refresh declaration-owned description, then re-run.
  await tasksRepo.updateTask(standing.id, {
    description: routineTaskDescription(template, trigger), // same builder as create
  });
  if (input.queue) {
    await dispatchTaskIfReady({ queue: input.queue, repo: tasksRepo, tenantId: trigger.tenant_id }, standing);
  }
  await triggersRepo.recordTriggerFire(trigger.id, `re-dispatched ${standing.identifier}`);
  return standing;
}
// No standing task (first fire, or previous generation was closed/cancelled):
// create one — existing createTask call, unchanged, trigger_id stamped.
```

Semantics locked here:
- **Resting status is `backlog`** (entry status → dispatchable, but semantically "not
  active now" and out of the todo lists humans work). `releaseTask` currently hardcodes
  `todo` (`dal/supabase.ts:1466ff`) — give it a `restingStatus` input the finalize step
  sets to `backlog` for routine tasks (`trigger_id` present). Matthias: status is not
  a problem — but don't leave standing tasks squatting in `todo`.
- **`in_review`/`blocked` skip the fire** (previously `in_review` counted as a finished
  cycle and spawned a sibling — with one standing task that would clobber the human's
  pending decision).
- **Terminal generation → new task.** A human closing (`done`) or cancelling the
  standing task ends that generation; the next fire creates a fresh one. Pausing a
  routine remains `enabled=false` on the trigger, not task surgery.
- The old stacking guard (`listOpenTriggerTasks`) is subsumed by this logic — remove it
  for the schedule branch rather than layering both.

### 2b — Disposition protocol: `ROUTINE_OK` / `ROUTINE_REVIEW`

Marker-token protocol (cheap, no tool plumbing; a structured `task_report` tool can
replace it later without changing semantics).

- Brief instruction (routine-task section in `buildTaskBrief`, only when `trigger_id`):

  ```
  ## Routine run protocol
  This task is the standing host of a recurring routine. This run is one cycle:
  check state (comments below, your routine workspace, prior learnings), decide
  whether anything needs doing, do small work inline. For substantial work, create
  a dedicated task instead of extending this run.
  End your final message with exactly one of:
  - `ROUTINE_OK` — nothing notable happened; the run is logged silently.
  - `ROUTINE_REVIEW: <one line why>` — a human should look at this run's result.
  - neither — your result is posted as a normal report comment.
  ```

- Parser: `apps/ai/src/ai/jobs/routine-disposition.ts` — pure function over
  `result_text`: token at start or end is stripped; a result that is ONLY the token
  is quiet with an empty report. Returns
  `{ disposition: "quiet" | "report" | "review", cleanedText }`. Unit-test the corpus:
  token-only, token+text, text+token, mid-text token (→ report, token left in place),
  no token.
- Envelope: `task-job-schema.ts` gains optional `run_disposition` (optional so
  in-flight snapshots parse — the established envelope rule).

### 2c — Finalize branches (routine tasks only; non-routine tasks unchanged)

In `writeResultStep` + `finalizeStep` (`task-job-steps.ts`), when `trigger_id` is set
and the run outcome is `completed`:

| Disposition | Comment | Task status | `task_runs.outcome` | Notification |
|---|---|---|---|---|
| `quiet` | **none** | `backlog` (resting) | `completed_quiet` | **none** |
| `report` | cleanedText as usual | `backlog` (resting) | `completed` | existing FYI `task_completed` |
| `review` | cleanedText + reason | `in_review` | `completed` | needs-input (review card) |

`failed` → `blocked` + notification, `needs_approval` → `blocked` + pending ops —
**both exactly as today**. Non-routine tasks (no `trigger_id`) keep the current
completed→`in_review` behavior; nothing changes for coordinator-planned work.

Also in this phase, cap brief growth (the standing task lives forever):
`buildTaskBrief`'s prior-comments section takes the **last 10 comments** only, with a
one-line pointer ("older history: task page / routine memory"). Long-term context is
Phase 3's job (memory), not an ever-growing brief.

### 2d — Migration of existing routine tasks

No data migration. Old per-fire tasks stay as history; the first post-deploy fire
finds no *non-terminal* trigger task (or finds the newest open one and adopts it as
the standing task — acceptable either way, choose adopt-open to avoid strays).
Delete the "close own previous in_review heartbeat tasks" clause from
`modules/engenty-coordinator/ai/routines/heartbeat/ROUTINE.md` — the hack this model
obsoletes — and note the stragglers clean up via the existing reaper/review flows.

**Checklist**
- [ ] DAL: `listTriggerTasks(triggerId, {nonTerminalOnly, limit})` (generalizes
      `listOpenTriggerTasks`; keep the old name as a thin wrapper or update callers).
- [ ] `releaseTask` gains `restingStatus` input; `tasks_release` zod + op-list test.
- [ ] Fire-path branch table above as unit tests: active-run skip / in_review skip /
      blocked skip / resting re-dispatch / terminal → new generation / event trigger
      untouched.
- [ ] Disposition parser + tests (5-case corpus).
- [ ] Envelope field optional; finalize branch table as tests (esp. quiet = no
      comment, no notification, `completed_quiet` outcome stamped).
- [ ] Brief: routine protocol section behind `trigger_id`; prior-comments cap.
- [ ] Coordinator ROUTINE.md: remove self-cleanup clause (Phase 1 reconcile now
      propagates the edit!).
- [ ] Run-panel UI: `completed_quiet` outcome renders as a muted "ok" row, not an
      error and not "In progress".
- [ ] E2E (dev, tenant-matched JWT): heartbeat fire → quiet run → task rests in
      `backlog`, zero comments, zero inbox items, run row `completed_quiet`; second
      fire re-dispatches the SAME task id.

## Phase 3 — Routine memory: run N+1 starts from what run N learned

As rev 1, unchanged in substance — now with the standing task's comments as a third
continuity channel (brief carries the last 10; memory carries the durable essence).

Convention (constant shared by both sides):

```ts
// modules/tasks/src/lib/routine-ref.ts (package-exported like task-workspace)
export const ROUTINE_ENTITY_TYPE = "tasks.routine";
export function routineEntityRef(triggerId: string): string {
  return `${ROUTINE_ENTITY_TYPE}:${triggerId}`;
}
```

- **Inject at brief time** — `buildBriefStep` already holds `taskRow.trigger_id`
  before calling `buildPriorLearningsSection` (`task-job-steps.ts:143` vs `:160`):

  ```ts
  entityRefs: [
    ...entityRefsFromContexts(contexts),
    ...(taskRow.trigger_id ? [routineEntityRef(taskRow.trigger_id)] : []),
  ],
  ```

  No change inside `task-prior-learnings.ts` — the `entity` branch already queries
  `memory_record_list({scope_kind:"entity", scope_ref})`.
- **Save at reflection time** — `buildReflectionPrompt` gains, when `trigger_id`:
  "Save routine-specific lessons with scope_kind 'entity' and scope_ref
  '`tasks.routine:<id>`' so the NEXT run starts from them." Keep the anti-hoarding
  bias untouched. Skip reflection entirely for `quiet` runs (nothing happened).
- **Surface** — routine detail gets a read-only Memory section (list op, link to
  `/settings/memory`), with a hint when `ENGENTY_AI_MEMORY_REFLECTION` is off.

**Checklist**
- [ ] `routine-ref.ts` + package export + tsup entry.
- [ ] Brief injection test; reflection prompt test (scope line iff trigger_id);
      quiet-run reflection skip test.
- [ ] E2E (reflection ON): run 1 saves a lesson → run 2's brief contains it.

## Phase 4 — Routine workspace: a durable folder between runs

As rev 1, unchanged. Mirror the task workspace with a sibling prefix.

```ts
// modules/tasks/src/lib/routine-workspace.ts (mirror task-workspace.ts)
export function routineWorkspaceStoragePrefix(tenantId: string, triggerId: string): string {
  return fileStorageTenantObjectKey(tenantId, "ai", "workspace", "routines", triggerId) + "/";
}
```

- Bootstrap in `performTaskCheckout` when the task has `trigger_id` (same idempotent
  `.keep` policy as `ensure-task-workspace-prefix.ts`, fail-open).
- Brief section "## Routine workspace" pointing at the prefix (read state from
  previous runs; write what the next run should find). With the standing task, the
  task workspace and routine workspace could arguably merge — keep them separate:
  the task workspace dies with a generation, the routine folder survives it.
- **Write access — verify, don't assume:** the artifacts audit found vault tools are
  copilot-only and native file_entries have no agent ops. Name the exact tool the
  specialist uses to write the prefix; if none exists, add a scoped
  `workspace_read_file`/`workspace_write_file` pair validated server-side against the
  two allowed prefixes (reject `../`, absolute keys, foreign prefixes). Task-job
  toolset only.
- Routine detail reuses the `TaskWorkspaceStrip` pattern with the routine prefix.

**Checklist**
- [ ] `routine-workspace.ts` + tests + package export.
- [ ] Checkout bootstrap (idempotent, fail-open) behind `trigger_id`.
- [ ] Tool audit resolved; if new tools: prefix-validation tests incl. traversal.
- [ ] Strip on routine detail; empty state.
- [ ] E2E: run 1 writes `state.md`, run 2's agent reads it (visible in thread log).

## Phase 5 — Routine ⇄ task surfaces (much simpler under model B)

- **RoutineDto** (`packages/ai-ui/src/features/routines/routines-api.ts`) gains
  `standing_task_id` + `standing_task_identifier` (resolved server-side via the
  Phase 2 DAL lookup). **Delete the dead `routine.thread_id` link** in
  `routine-detail-sections.tsx`.
- **Routine detail "Runs" section** = the standing task's run history: reuse the
  task page's run-card list (`LiveTaskRunsPanel` data path — `listTaskRuns` on the
  standing task id), each row `{outcome badge} · {relative time} · {duration}`, plus
  a prominent "Open task {identifier}" link (comments, review card, approvals all
  live there). Quiet runs render muted. `last_result` stays only as the empty-state
  fallback.
- **Tasks list:** standing routine tasks get a routine chip (reuse
  `task-routine-property-row.tsx` lookup) — inflation is solved at the root now, so
  no filter toggle needed; resting-in-`backlog` already keeps them out of todo
  views. **Operations tree:** give trigger-tasks a "Routines" group instead of
  `UnplannedTasksSection`.

**Checklist**
- [ ] Server: routine list/get enriches standing task id+identifier (one query, no
      N+1 over routines — batch by `trigger_id IN (…)`).
- [ ] `pnpm --filter @engenty/ai-ui build` BEFORE touching module UI (types resolve
      against dist).
- [ ] Dead link removed; Runs section shows live + finished + quiet runs.
- [ ] Manual `tsc --noEmit` spot-check on every touched `ui/` file; eyeball only NEW
      errors (pre-existing noise is known).
- [ ] Realtime: runs section refetches on `task_runs` events (table is in the
      `supabase_realtime` publication).

## Phase 6 — Optional polish (separate commits, skip freely)

- **Run distillation:** `@mastra/memory@1.23` ships `Memory.summarizeThread()` — on
  finalize of a `report`/`review` routine run, distill the run thread into a
  one-paragraph summary (comment or routine-scoped memory). Explicit and per-run,
  not context-pressure-triggered.
- **Live-session signal delivery:** Mastra schedules can deliver fire-signals into
  existing threads — a future alternative to skip-when-active (the fire nudges the
  live run instead of skipping). Evaluate only after model B has soaked.
- **Schedules-API-native firing:** post-rename, evaluate replacing the
  heartbeat-`prepare()`-hook indirection with a scheduled invocation of
  `triggers_fire`. Behavior-neutral; keep quiet-hours + enabled checks.
- **Naming:** routine detail shows "Prompt" (template description) and the ROUTINE.md
  body as indistinguishable prose — rename once runs are visible.

---

## Acceptance (the whole plan is done when)

1. Editing a module ROUTINE.md changes the tenant's routine instructions on next
   boot, without touching `enabled`/`cron`. (Phase 1)
2. A schedule routine has exactly ONE non-terminal task at any time; ten fires
   produce ten run rows on it, not ten tasks. Quiet runs leave no comment and no
   notification. `ROUTINE_REVIEW` runs land in `in_review` and skip subsequent fires
   until resolved. (Phase 2)
3. A routine's later run demonstrably uses a lesson + a workspace file left by an
   earlier run. (Phases 3+4)
4. The routine detail page shows the run history with dispositions and durations and
   links to its standing task; the dead link is gone. (Phase 5)
5. Zero new migrations; `pnpm --filter ./modules/tasks test` and
   `pnpm --filter ./apps/ai test` green; repo biome clean; **tests run BEFORE any
   release** (build+typecheck alone has burned us twice).

## Standing gotchas (collected from prior phases — read before each phase)

- tsx watch does not restart core on module edits → `touch apps/core/src/api-entry.ts`.
- Bare `vitest run` from a package globs the whole workspace; vitest substring
  filters need a trailing slash.
- `ENGENTY_AI_SERVICE_JWT` is single-tenant; mismatch = task jobs die silently in
  checkout ("dispatched tenant X does not match…").
- Never `git add -A` in the shared checkout; stage files explicitly.
- Module UI is not typechecked by CI — manual `tsc --noEmit` on touched files is part
  of Definition of Done for any `ui/` change.
- `modules/tasks` op-list test asserts the exact gateway op set — every new/changed op
  updates it in the same commit.
- Envelope schema fields must be optional (in-flight workflow snapshots must parse).
