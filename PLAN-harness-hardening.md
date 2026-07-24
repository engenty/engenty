# PLAN — Harness hardening: gap register + Mastra 1.52 completion

**Status:** implemented (code complete) · 2026-07-24
**Source:** gap register of the 2026-07-24 agent-harness deep dive (claude.ai artifact
`dfb53e58`, §9), scoped against `PLAN-routine-scheduled-specialist.md` (rev 2) and the
in-flight Mastra `1.49.0 → 1.52.1` upgrade.
**Work mode:** directly on `main`. One migration (dropping a dead pgmq queue) —
everything else is code-only.

## Ordering — run this BEFORE the routine rework

This plan is a prerequisite train, not a parallel one:

1. **Phase 1 is boot-blocking.** `apps/ai/package.json` already pins
   `@mastra/core@1.52.1` (uncommitted), and 1.52's typings export **only
   `mastra.schedules`** — the scheduler's ten `mastra.heartbeats.*` call sites
   (`apps/ai/src/scheduler/heartbeat-sync.ts`) are type errors and runtime
   `undefined` under the new dependency. Nothing else can land on top of a
   non-booting scheduler, and the routine plan's Phase 0 explicitly waits for this.
2. **Phases 2–3 harden exactly what the routine plan leans on harder.** Under run
   model B every schedule routine depends on ONE standing task being re-dispatched
   each fire. Today a handler failure permanently drops the dispatch message
   (`pop` = read+delete, no retry) and a failed `markBlocked` is silently swallowed —
   with per-fire tasks that stranded one visible task; with a standing task it means
   a routine silently skips cycles.
3. **Phase 5 (UI typecheck) protects the routine plan's Phase 5.** The dead
   "View run details" link shipped precisely because `modules/tasks/ui` is not
   typechecked; adding routine surfaces without a gate invites a repeat.
4. Phase 4 (dead-weight removal) touches the same files the routine plan edits
   (`dal/supabase.ts`, trigger migrations context) — cheaper to land first than to
   rebase around.

**Owned elsewhere — do NOT do here:** the dead routine link + ROUTINE.md reconcile
(routine plan Phases 5/1), artifacts convergence (`artifact:<id>` resolver, task
output → artifacts; separate initiative), triple run-bookkeeping consolidation
(deferred until after the routine plan reshapes run surfacing), operations-tree
server-side filtering (folded into routine plan Phase 5's ops-tree work).

---

## Phase 1 — Finish the Mastra 1.52 upgrade (boot-blocking)

### 1a — Schedules rename

The dependency bump sits uncommitted (`apps/ai/package.json`,
`packages/retrieval/package.json`, `pnpm-lock.yaml` — coordinate with whoever made
it; this phase is the code half of that upgrade). 1.50 renamed the heartbeats API to
Schedules: `mastra.heartbeats` → `mastra.schedules`, `Heartbeat` → `AgentSchedule`,
config key `heartbeat` → `schedules`, agent schedule ids get an `agent_` prefix,
fire-signal tag `<heartbeat>` → `<schedule>`, HTTP `/api/heartbeats/*` →
`/api/schedules/*`.

Surface (804 lines total, all in `apps/ai/src/scheduler/` + wiring):

| File | What changes |
|---|---|
| `heartbeat-sync.ts` (271) | all ten `mastra.heartbeats.get/create/update/delete/list` → `mastra.schedules.*`; verify create-payload field names against 1.52 typings (`AgentSchedule`), not the changelog |
| `heartbeat-hooks.ts` (123) | `prepare`/`onFinish`/`onError` hook registration — config key + types |
| `heartbeat-metadata.ts` (39) | metadata contract marker — id prefixes: schedules created for agents get an `agent_` prefix in 1.50+; the orphan-cleanup matcher (`hb_trigger-*`, `hb_system-*`) must match what 1.52 actually stores, verify against a live row in `ai.mastra_schedules` |
| `scheduler-agent.ts` (21), `start.ts` (114), `system-jobs.ts` (154), `app.ts:789` wiring | type imports, `startWorkers` interplay, comments |
| `modules/tasks` trigger columns | `triggers.heartbeat_id` stays as-is (it stores OUR id string; only verify the stored ids still match what `schedules.get` expects — if 1.52 re-keys them, `syncTriggerHeartbeat` will fall into its create-branch and orphan the old row: test this) |

Approach: rename mechanically, then let `tsc` drive — `pnpm --filter ./apps/ai build`
until clean. Do NOT trust field names from release notes; open
`apps/ai/node_modules/@mastra/core/dist/` typings for `AgentSchedule` and the
`schedules` manager and match them.

### 1b — AgentController message-shape audit (1.52 breaking)

1.52 moved AgentController messages to the canonical `MastraDBMessage` shape: parts
under `content.parts`, terminal status under `content.metadata`, signals as separate
`role: 'signal'` messages. Ten files consume message/event APIs — audit each against
the new shape (grep hits for `message_start|message_update|message_end|listMessages|
listActiveMessages`):

- `apps/ai/src/ai/conversation/session-agui-bridge.ts` (the AG-UI event converter —
  highest risk)
- `apps/ai/src/ai/conversation/delegate-run.ts` (final-text capture from stream)
- `apps/ai/src/ai/conversation/persist-sub-agent-progress.ts`
- `apps/ai/src/ai/memory/engenty-session-memory-storage.ts` (`saveMessages` sink —
  new `role:'signal'` rows must NOT be persisted as visible thread messages; decide
  filter-or-store explicitly)
- `apps/ai/src/ai/sessions/messages-snapshot.ts`, `session-service.ts`,
  `resolve-tool-call-history.ts`, `reconcile-orphaned-interrupt.ts`
- `apps/ai/src/dal/agent-sessions/agent-session-store.ts`,
  `apps/ai/src/api/agent-sessions-routes.ts`

### 1c — Verification gate (the actual definition of "upgrade done")

- [x] `pnpm install` + `pnpm --filter ./apps/ai build` clean (tsc is the rename
      driver).
- [x] `pnpm --filter ./apps/ai test` — full suite, compare failures against the
      pre-upgrade baseline on the same checkout (there are known pre-existing reds;
      only NEW failures block). Full `@engenty/ai` suite green (561 tests) in the
      release gate run.
- [ ] Live boot (dev): scheduler reconciles — every schedule trigger has a live
      `ai.mastra_schedules` row, `triggers.heartbeat_id` populated, no orphan
      churn in logs on second boot (idempotency).
- [ ] Manual fire of the coordinator heartbeat routine → task re-dispatched → run
      completes (proves hooks still fire post-rename).
- [ ] Copilot chat smoke: stream renders text + tool calls; a HITL approval
      round-trips (proves 1b — the bridge survived the message-shape change).
- [x] Commit together with the (currently uncommitted) dependency bumps — deps and
      code must not land separately.

## Phase 2 — Dispatch reliability: at-least-once with dead-letter cap

**Today:** `startQueueWorker` (`packages/queue/src/index.ts:201-274`) uses
`queue.pop()` — read+delete atomic — then swallows handler failures at L241-247. A
crash or a thrown handler permanently loses the dispatch. The service ALREADY exposes
`read(queue, vt, n)` + `archive` + `delete` (L129-158) — only the worker needs to
change; no SQL, no new RPC.

```ts
// packages/queue/src/index.ts — worker loop, replacing the pop block
const MAX_READS = 5;               // read_ct cap → dead-letter
const VISIBILITY_SECONDS = 120;    // > task-job checkout step, < reaper grace

const [msg] = await queue.read(queueName, VISIBILITY_SECONDS, 1);
if (!msg) continue;
processed++;

if (msg.read_ct > MAX_READS) {
  logger.error("Queue job dead-lettered", { queue: queueName, msgId: msg.msg_id, readCount: msg.read_ct });
  await queue.archive(queueName, msg.msg_id);   // archive table keeps it inspectable
  continue;
}
try {
  await handlers.get(queueName)!(msg.message as Record<string, unknown>, {
    msgId: msg.msg_id, readCount: msg.read_ct,
  });
  await queue.archive(queueName, msg.msg_id);   // success ⇒ ack
} catch (err) {
  logger.error("Queue job failed — will retry after visibility timeout", {
    queue: queueName, msgId: msg.msg_id, readCount: msg.read_ct,
    error: err instanceof Error ? err.message : String(err),
  });
  // no ack: message reappears after VISIBILITY_SECONDS with read_ct+1
}
```

Semantics to lock:
- **Success ⇒ `archive`** (not `delete`) — the pgmq archive table becomes the free
  audit trail of processed dispatches.
- **Failure ⇒ no ack** — redelivery after the visibility timeout; `read_ct` is the
  natural retry counter; cap at `MAX_READS` then archive as dead-letter (log at
  error level; a metrics hook can come later).
- **Redelivery is safe for every existing consumer** — verify, don't assume:
  - `agent_task_dispatch` (`apps/ai/src/api/task-dispatch-consumer.ts`): a
    redelivered message for an already-running task hits the checkout 409 →
    envelope `skipped` → workflow no-ops. Idempotent. ✅ (add a test)
  - Any other `startQueueWorker` handler in the repo: `rg startQueueWorker` and
    check each for idempotency; document the finding in the commit message.
- `VISIBILITY_SECONDS` vs the workflow: the handler only *starts* the workflow run
  (`createRun` + `run.start` — the await returns when the workflow finishes; check
  whether the consumer awaits completion or fire-and-forgets. If it awaits, a long
  specialist run exceeds vt and the message redelivers MID-RUN → checkout-409 skip
  makes this harmless, but confirm with a test rather than an argument).

**Checklist**
- [x] Worker rewrite + config knobs (`visibilitySeconds`, `maxReads`) on
      `QueueWorkerConfig` with the defaults above.
- [x] Unit tests (fake QueueService): success→archive; failure→no-ack;
      read_ct>cap→dead-letter-archive; empty-queue backoff unchanged.
- [x] Redelivery-idempotency test for the dispatch consumer (409 path).
- [x] `pgmq_read`/`pgmq_archive` public RPC wrappers exist in the base migration —
      verify both are granted to the service role (they're already in the
      QueueService interface, so they should be; if the RPC is missing in some env
      the worker must fail loudly, not fall back to pop). SECURITY DEFINER wrappers
      in `00000000000001_initial_schema.sql`; no pop fallback.
- [x] Metrics sanity: `queue.metrics()` unchanged; archive growth is fine (pgmq
      archive tables are partitioned by pgmq itself... verify: if unpartitioned,
      note a retention follow-up in the commit message rather than building one).
      Retention follow-up: note in commit if archive tables prove unpartitioned.

## Phase 3 — Stop stranding tasks: protect load-bearing statuses + un-swallow markBlocked

**Root cause chain:** `markBlocked` (`modules/tasks/src/api/task-dispatch-service.ts:57-71`)
swallows failures because "a tenant may have removed the status" — and that is
possible because only `todo`, `in_progress`, `done` are non-deletable
(`modules/tasks/src/domain/task-status-builtins.ts:4-8`) while the dispatch/approval/
review machinery hard-depends on `blocked`, `in_review`, and (routine plan rev 2)
`backlog` as a resting status.

**3a — make the machinery's statuses non-deletable.** Extend the non-deletable set to
`todo, in_progress, done, blocked, in_review, backlog, cancelled` — i.e. every status
the state machine writes by name. Tenants keep full freedom to ADD custom statuses;
they lose the ability to delete the rails. Update the settings UI copy
(`task-statuses-settings-section.tsx`) to say why ("used by agent runs and reviews").

**3b — un-swallow.** With 3a the "status missing" excuse is gone; a failure here is a
real fault and must be visible:

```ts
// task-dispatch-service.ts
async function markBlocked(deps: DispatchDeps, task: Task): Promise<void> {
  if (task.status === "blocked") return;
  try {
    await deps.repo.updateTask(task.id, { status: "blocked" }, { actorKind: "agent" });
  } catch (err) {
    // Status rails are non-deletable (3a) — this is a genuine fault, not a
    // tenant-config case. Surface it: the task would otherwise look runnable
    // while never dispatching.
    await deps.repo
      .logActivity({
        task_id: task.id,
        event_type: "tasks.block_failed",
        payload: { error: err instanceof Error ? err.message : String(err) },
      })
      .catch(() => {});
    throw err;
  }
}
```

Callers: `dispatchTaskIfReady` currently treats `markBlocked` as best-effort — after
3b it propagates. Audit the (few) dispatch sites so a create/update API call that
trips this returns a real error instead of a fake success.

**Checklist**
- [x] Non-deletable set extended + settings UI blocks deletion with explanation;
      existing tenants that ALREADY deleted one of these statuses: reconcile on
      boot/settings-save by re-inserting the builtin (idempotent) — check how
      `task_status_definitions` merges builtins before assuming.
      `REQUIRED_STATUS_ORDER` / merge path re-inserts missing rails.
- [x] `markBlocked` throws + logs activity; dispatch-site audit; tests: status
      update fails → activity row written + error propagates; happy path unchanged.
- [x] Regression: routine plan's resting-status `backlog` is now guaranteed to exist.

## Phase 4 — Dead-weight removal (small, do in one commit each)

**4a — drop the orphaned coordinator queue** (zero producers/consumers; superseded by
`agent_task_dispatch` — see `goal-handoff-service.ts:3-14`). New migration in
`modules/tasks/supabase/migrations/`:

```sql
-- 2026072XXXXXXX_plugin_tasks_drop_coordinator_queue.sql
-- The dedicated coordinator dispatch queue (created 20260722160100) was
-- abandoned before use: goal handoffs ride agent_task_dispatch. Remove it.
do $$
begin
  perform pgmq.drop_queue('agent_coordinator_dispatch');
exception when others then
  -- queue absent (fresh installs after this migration) — nothing to drop
  null;
end $$;
```

Migration numbering gotchas (both have bitten): unique FILENAME across the repo AND
unique TIMESTAMP across all modules+core (Supabase keys `schema_migrations` by
version; a duplicate PK blocks ALL migrations). Grep `supabase/migrations` across the
whole repo for the chosen timestamp before committing.

**4b — retire `request_depth`** (always written `0` at `dal/supabase.ts:781`, read
into types at `:95`, used by nothing): remove the write, the type field, and the zod
field. Leave the DB column (dropping columns is not worth a migration; add a
`-- dead, kept for compat` note next time that migration file is touched).

**4c — narrow dead enums in code only:** `task_runs.role` is only ever `'checkout'`
(`dal/supabase.ts:1437`) — narrow the zod/type to the literal and comment that
`work|review` remain DB-allowed but unwritten. `goals.owner_agent_id` cannot
reference built-in agents (shadowed by `owner_agent_type_key`) — remove it from
create/update input types so no new code paths grow on it; leave reads + column.

**Checklist**
- [x] 4a migration applied to dev DB (`pnpm db:migrate` — NEVER `pnpm engenty setup`,
      which includes a data-wiping reset); verify queue gone
      (`select * from pgmq.list_queues()`), re-run migration idempotent.
      Applied as `20260724120000_plugin_tasks_drop_coordinator_queue.sql`.
- [x] 4b/4c: types/zod/DAL edits + **op-list test** if any op schema changed;
      `pnpm --filter ./modules/tasks test` green. (No op schema change.)

## Phase 5 — modules/tasks UI typecheck gate

The `ui/` tree ships to production with zero type checking (`package.json` scripts:
tsup + vitest + biome only) — that is how `routine.thread_id` (dead link) and the
earlier `run.agent_thread_id` mismatch shipped. Known: a bare
`tsc --noEmit -p tsconfig.json` currently has substantial pre-existing noise
(kanban, test-helpers, stale DTO fields).

Bounded approach — triage first, then gate:

1. Baseline: `pnpm --filter ./modules/tasks exec tsc --noEmit -p tsconfig.json 2>&1 | head -100`
   and bucket the errors (missing DTO fields / stale imports / test-helper types /
   genuinely-wrong code). Timebox the burn-down; fix real bugs, `// @ts-expect-error`
   with a ticket-style comment ONLY for noise whose fix belongs to another plan
   (e.g. `RoutineDto.thread_id` dies in the routine plan).
2. Gate: add `"typecheck": "tsc --noEmit -p tsconfig.json"` to
   `modules/tasks/package.json` and wire it into the repo-wide turbo `typecheck`
   pipeline (the workspace already runs a 79-package typecheck — this module must
   stop being the exception).
3. Prereq note: `@engenty/ai-ui` must be built first (module UI types resolve
   against its `dist`) — mirror however the other UI-bearing modules order this in
   turbo.

**Checklist**
- [x] Baseline snapshot pasted into the commit message (error count before/after).
      **58 → 0** (two `@ts-expect-error` for routine `thread_id`, deferred to
      routine plan). Paste into commit message when committing.
- [x] Zero errors (or explicit `@ts-expect-error` + reason), script added, turbo
      wired, CI run green. Script + turbo wired; CI green pending commit/push.
- [ ] Sanity: introduce a deliberate type error in `ui/`, confirm CI fails, revert.

## Phase 6 — Blocked sub-reasons (small UX honesty fix)

`blocked` conflates three states users can't distinguish without inspecting arrays.
The data to disambiguate already exists on the task row — derive, don't store:

```ts
// modules/tasks/src/domain/blocked-reason.ts
export type BlockedReason = "approval" | "dependencies" | "failed";
export function blockedReason(task: Pick<Task,
  "pending_approval_operation_ids" | "blocked_by_task_ids">): BlockedReason {
  if ((task.pending_approval_operation_ids ?? []).length > 0) return "approval";
  if ((task.blocked_by_task_ids ?? []).length > 0) return "dependencies";
  return "failed"; // finalize parks failed runs at blocked with neither list set
}
```

Surface as a suffix on the status badge (task detail + list rows + kanban card):
"Blocked · awaiting approval" / "· waiting on 2 tasks" / "· run failed". en/de
locales. Note: "dependencies" wins over "failed" only when blocker tasks are still
OPEN — if you want that precision, reuse `openBlockerIds` from
`domain/task-blockers.ts` where the caller already has the statuses loaded; for list
rows the array-presence heuristic is acceptable.

**Checklist**
- [x] Pure helper + tests (3 branches + both-set precedence: approval wins).
- [x] Badge suffix in detail/list/kanban; locales; manual `tsc` spot-check on
      touched `ui/` files (or rely on Phase 5's gate if landed first).

---

## Explicitly deferred (decided, with reasons — do not silently resurrect)

- **Triple run-bookkeeping consolidation** (`task_runs` + `ai.agent_run` + workflow
  snapshot): real debt, but the routine plan reshapes what "a run" surfaces as;
  consolidating before it lands means doing the analysis twice. Revisit after.
- **`tasks.status` DB constraint:** rejected — tenants define custom statuses
  (`tenant_settings.task_status_definitions`), so a static CHECK is wrong and a
  trigger-validated FK into tenant settings is complexity without a driving
  incident. Phase 3a (non-deletable rails) covers the load-bearing subset.
- **Artifacts convergence** (task output → artifacts, `artifact:<id>` resolver):
  separate initiative with its own design questions.

## Acceptance (plan done when)

1. [~] `apps/ai` builds + full test suite green on `@mastra/core@1.52.1` (done);
   live boot / schedule fire / copilot HITL still open. (Phase 1)
2. [x] A dispatch handler crash no longer loses the message: it redelivers up to the
   cap and dead-letters visibly. (Phase 2)
3. [x] The state-machine statuses cannot be deleted by tenants and a failed
   block-flip is loud. (Phase 3)
4. [x] Coordinator queue gone; `request_depth` gone from code; dead enums narrowed.
   (Phase 4)
5. [x] `modules/tasks` typecheck (incl. `ui/`) runs at zero errors (turbo-wired; CI
   green pending push). (Phase 5)
6. [x] A blocked task says WHY it's blocked. (Phase 6)

## Standing gotchas

- Migration timestamps must be unique across ALL modules + core (schema_migrations
  PK); filenames unique repo-wide.
- `pnpm db:migrate` for additive migrations; never the setup/reset path on a dev DB
  with data.
- tsx watch does not restart core on module edits → `touch apps/core/src/api-entry.ts`.
- `modules/tasks` op-list test asserts the exact op set — update in the same commit
  as any op change.
- Run the touched packages' real test suites BEFORE any release; build+typecheck is
  not enough.
- Never `git add -A` in the shared checkout; the Mastra dep bumps are someone
  else's uncommitted work — coordinate Phase 1's commit with them.
