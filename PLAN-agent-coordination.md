# PLAN — Agent coordination: dependency graph + doctrine skills + agent catalog

Status: PLANNED · Author: audit session 2026-07-21 · Source analysis: paperclip
(`/Users/m/code/cursor/paperclip/skills/`) vs `modules/tasks` + `modules/engenty-coordinator`.

## Why (context for the implementer)

engenty's agent-to-agent coordination already has the **channel** (task comments:
the executing agent posts a `🤖` result comment; the coordinator reviews
`in_review` tasks and either sets `done` or sends back `todo` with feedback,
which re-dispatches with the thread as context) and the **executor** (the
`agent_task_dispatch` queue auto-runs agent-assigned tasks). What it lacks,
verified against the code:

1. **No dependency graph.** `Task` has `parent_id` and `goal_id` but **no
   blocked-by field**. "B starts when A lands" cannot be expressed, so the
   coordinator compensates by polling on heartbeat with a 3-day stale window.
   Paperclip's entire engine is one rule: *the executor automatically starts
   any assigned task with no open blockers; when done, dependents auto-wake.*
   This also delivers **parallel fan-out for free**: independent branches of
   the graph all dispatch concurrently — no new Mastra primitive needed.
2. **No doctrine.** Coordination quality lives in skills, not orchestration
   code. Paperclip ships ~571 lines of operating procedure (plan→tasks method,
   final-disposition rules, hiring workflow + role templates); engenty has one
   88-line `coordinator-workflow` skill.
3. **No agent catalog taxonomy.** Position decided 2026-07-21: **we do not
   believe in departments** — we group around skills and capabilities. Modules
   already carry `category` in `engenty.plugin.json` (e.g. contacts →
   `"work"`); agents should get the same: "Marketing Agents", "Branding
   Agents", "Commercial Agents" as *catalog labels* for templates/wizard —
   never a runtime concept.

Phases are independent-ish but do them in order: 1 → 2 → 3 → 4. Phase 1 is the
only schema change; 2–4 are prose + small manifest/UI work.

## Ground facts (verified — do not re-derive, but re-check before relying on line numbers)

- Task statuses are **tenant-configurable strings** (`TaskStatus = string` in
  `modules/tasks/src/schema/types.ts`). Canonical ids live in
  `modules/tasks/src/domain/task-lifecycle.ts`; `"blocked"` is already a known
  status string — `NON_CHECKOUT_ENTRY_STATUSES` in
  `modules/tasks/src/api/task-dispatch-queue.ts` includes it.
- Dispatch gate: `isDispatchableTask()` in `task-dispatch-queue.ts` (assignee
  kind `agent`, `checkout_run_id === null`, status not in the non-entry set).
- `enqueueTaskDispatch()` is called from `modules/tasks/src/api/gateway-methods.ts`
  (`tasks_create` ~line 172, `tasks_update` ~line 206), `trigger-fire.ts:85`,
  and `api/index.ts` (~342, ~421 — realtime/boot paths).
- Module events emitted: `tasks.checked_out | released | status_changed |
  assignee_changed | comment_added` (`schema/types.ts` ~119).
- Gateway ops available to agents: `tasks_list/get/create/update/delete/
  add_comment/checkout/release/list_runs/list_activity`, `goals_*`.
- Coordinator agent (`modules/engenty-coordinator/ai/agents/engenty.coordinator/agent.json`)
  already has tools `registry_agents_list` and `agent_propose`
  (backed by `apps/ai/src/api/registry-routes.ts`) and skill
  `coordinator-workflow` (`modules/engenty-coordinator/ai/skills/coordinator-workflow/SKILL.md`).
- The dynamic-agent runtime exists and is unused: `apps/ai/src/ai/registry/
  database-provider.ts` (tenant-scoped `getAgentConfig`/`listAgents`) +
  `assemble-dynamic-agent.ts` (allow-listed tools, guardrail processors,
  memory). `agent_propose` is the governed writer path into it.
- Paperclip reference material to port from (read them before writing Phase 2/3):
  - `/Users/m/code/cursor/paperclip/skills/paperclip/SKILL.md` (heartbeat,
    blockers, final-disposition checklist, comment style, planning)
  - `.../skills/paperclip-converting-plans-to-tasks/SKILL.md` (42 lines — port nearly whole)
  - `.../skills/paperclip-create-agent/SKILL.md` + `references/` (role templates,
    draft checklist, baseline-role-guide)

## Work mode

Phase 1 adds a migration → per the release skill this is **worktree + a careful
choice on DB**: the migration is additive (one nullable array column + one
index), NOT schema-breaking, so a plain worktree sharing the dev Supabase is
acceptable (`git worktree add ../engenty-pro-coordination -b feat/agent-coordination main`).
Phases 2–4 are main-safe but keep them on the same branch for one coherent land.

**Migration gotcha (hard-won, do not skip):** migration filenames are ordered
by timestamp and the aggregator breaks on timestamp collisions
(`schema_migrations_pkey` dup blocks ALL migrations). Pick a timestamp later
than every existing one across ALL modules (check
`ls modules/*/supabase/migrations/ packages/*/supabase/migrations/ | sort`),
e.g. `20260722000100_plugin_tasks_blockers.sql`. After adding: run
`pnpm engenty setup && pnpm db:migrate`.

---

## Phase 1 — Task dependency graph (`blocked_by_task_ids` + auto-wake)

Goal: express "A is blocked by B" first-class; dependents auto-dispatch when
blockers resolve; parents wake when all children finish. Mirrors paperclip's
`blockedByIssueIds` semantics exactly, including: **the array replaces the
current set on update; `[]` clears; self-blocks and cycles rejected;
`cancelled` blockers do NOT count as resolved.**

### 1.1 Migration (`modules/tasks/supabase/migrations/20260722000100_plugin_tasks_blockers.sql`)

```sql
alter table module_tasks.tasks
  add column if not exists blocked_by_task_ids uuid[] not null default '{}';

-- Reverse lookup "which tasks does X block" without a scan:
create index if not exists tasks_blocked_by_gin
  on module_tasks.tasks using gin (blocked_by_task_ids);
```

Notes for the implementer:
- Match the module's existing migration style — open an existing file in
  `modules/tasks/supabase/migrations/` and copy its header/grants pattern.
  If existing migrations re-grant table privileges after ALTER, do the same.
- No new table: an array column mirrors paperclip and avoids join-table
  plumbing through the DAL.

### 1.2 Schema + zod (`modules/tasks/src/schema/types.ts`, `zod.ts`)

- `Task` interface: add `blocked_by_task_ids: string[];`
- `TaskUpdateInput`/create input types: add `blocked_by_task_ids?: string[];`
- zod: `blocked_by_task_ids: z.array(z.string().uuid()).max(32).optional()`
  on both create and update input schemas. Describe it:
  `"Task ids that must reach 'done' before this task is dispatchable. Replaces the whole set on update; [] clears."`

### 1.3 Validation (in `modules/tasks/src/api/gateway-methods.ts`, `tasks_create` + `tasks_update` handlers)

Add a `validateBlockers(taskId | null, blockedBy, repo)` helper (new file
`modules/tasks/src/domain/task-blockers.ts` so it's unit-testable):

1. Reject `blockedBy.includes(taskId)` → `"a task cannot block itself"`.
2. All referenced ids must exist in the same tenant (repo lookup) → reject
   unknown ids with the id in the message.
3. Cycle check: walk the graph from each blocker following THEIR
   `blocked_by_task_ids` (breadth-first, visited-set, cap depth at 64);
   if you reach `taskId`, reject → `"circular blocker chain"`.
4. On update the array REPLACES the stored set (no merging).

### 1.4 Dispatch gate (`modules/tasks/src/api/task-dispatch-queue.ts`)

`isDispatchableTask` currently checks assignee/checkout/status only. It cannot
see other rows, so add a second, async gate where dispatch is enqueued:

- New helper in `task-blockers.ts`:

```ts
/** A blocker is resolved ONLY when status === 'done'. Cancelled does not count
 *  (mirrors paperclip): remove/replace cancelled blockers explicitly. */
export function openBlockerIds(task: Task, byId: Map<string, Task>): string[] {
  return task.blocked_by_task_ids.filter((id) => byId.get(id)?.status !== "done");
}
```

- At every `enqueueTaskDispatch` call site (gateway-methods ~172/~206,
  trigger-fire.ts:85, api/index.ts ~342/~421): before enqueueing, load the
  blockers (single `in()` query via the DAL) and skip the enqueue if
  `openBlockerIds(...).length > 0`. When skipped AND the task's status is a
  checkout-entry status, flip the task to `status: "blocked"` (so the UI and
  coordinator see the truth) and emit `tasks.status_changed` as usual.

### 1.5 Auto-wake on blocker resolution (the core payoff)

Hook point: wherever `tasks_update` lands a task in `"done"` (gateway-methods
update handler, and the dispatcher's own completion path — find it by greping
`"in_review"`/`status.*done` under `apps/ai/src/ai/jobs/` for the task-job
writeResult step; the STATUS WRITE goes through the tasks gateway, so the
gateway handler is the single choke point — verify this claim by tracing one
task-job run before relying on it).

After a task T transitions to `done`:

1. Find dependents: `select * from tasks where blocked_by_task_ids @> ARRAY[T.id]`
   (add a DAL method `listBlockedBy(taskId)` using `.contains()`).
2. For each dependent D: recompute `openBlockerIds(D)`. If empty:
   - if `D.status === "blocked"` → set status to `"todo"` (emit status_changed),
   - call `enqueueTaskDispatch` for D (it re-checks `isDispatchableTask`).
3. Emit a new module event `tasks.blockers_resolved` with
   `{ task_id: D.id, resolved_by: T.id }` (add to the event union in types.ts).

**Children-completed wake:** in the same `done` hook, if T has `parent_id`,
list siblings (`parent_id = T.parent_id`); if ALL are terminal
(`done`/`cancelled`), add a comment on the parent:
`"All subtasks complete."` and, if the parent is agent-assigned and
dispatchable, `enqueueTaskDispatch(parent)`. Emit `tasks.children_completed`.

### 1.6 Coordinator + skill awareness

- `coordinator-workflow/SKILL.md` Step 4 (task creation JSON): add
  `blocked_by_task_ids` with one sentence: *"Wire real dependencies via
  blocked_by_task_ids — never as prose. Independent tasks are dispatched in
  parallel automatically; do not serialize work that has no real dependency."*
- Step 3 table: add category **Blocked** — `status "blocked"`; skip unless its
  blockers are all done (then flip to todo) or it has sat blocked > 3 days with
  no open blockers (data bug — flag it).

### 1.7 Tests (all colocated, follow existing patterns in `modules/tasks/src/api/*.test.ts` if present, else `*.test.ts` next to the unit)

- `task-blockers.test.ts`: self-block rejected; unknown id rejected; 3-node
  cycle rejected; diamond (A←B, A←C, D←B+C) accepted; `openBlockerIds` treats
  `cancelled` as OPEN; replace-not-merge semantics.
- Dispatch gate: task with open blockers is NOT enqueued and flips to
  `blocked`; with all-done blockers it enqueues.
- Wake: completing the last blocker flips dependent `blocked→todo`, enqueues
  it, emits `tasks.blockers_resolved`; completing the last child comments +
  wakes the parent.
- Run: `pnpm --filter @engenty/tasks test` (verify the exact package name via
  `node -p "require('./modules/tasks/package.json').name"`).

Acceptance: create A(agent)→done, B(agent, blocked_by:[A]); B must dispatch
only after A is done, with no coordinator involvement.

---

## Phase 2 — Doctrine skills (prose only, highest value per effort)

### 2.1 New skill `modules/engenty-coordinator/ai/skills/converting-goals-to-tasks/SKILL.md`

Port `/Users/m/code/cursor/paperclip/skills/paperclip-converting-plans-to-tasks/SKILL.md`
(42 lines) with engenty vocabulary. Keep every rule, adapt the mechanics:

- "issues" → tasks (`tasks_create`), "blockedByIssueIds" → `blocked_by_task_ids`,
  "look up the company's agents" → `registry_agents_list` (match
  `primary_assignee_agent_type_key` EXACTLY to a registry id).
- Keep verbatim (adapted): *plan deeply / know your team / assign for
  specialty / take responsibility / use the dependency tree / order then
  parallelize / enough is enough* + the pre-publish checklist.
- Frontmatter: `name: converting-goals-to-tasks`, allowed-tools same as
  coordinator-workflow.
- Register it in the coordinator's `agent.json` `skills` array.

### 2.2 Final-disposition rules → append to `coordinator-workflow/SKILL.md`

New section "Before you finish a cycle" adapted from paperclip Step 8:

- `done`: work complete AND verification recorded in a comment.
- `in_review`: only when a real reviewer path exists (coordinator review on
  next heartbeat counts; "self-assigned + please review" does not).
- `blocked`: only with `blocked_by_task_ids` set OR a comment naming the human
  owner and the exact unblock action.
- Never exit leaving a task `in_progress` without an active run
  (`checkout_run_id`) — release it or set an honest status.
- **Blocked-task dedup:** if your latest comment on a blocked task is already
  a blocked-status note and nothing changed since, do not comment again.

### 2.3 Comment style (small section, port from paperclip "Comment Style")

Result comments state: what was done, what evidence exists (link/id), what
remains. Reference tasks by `identifier` (e.g. `T-42`), not UUID.

No tests — but have a second model review the ported skills against the
paperclip originals for lost rules (checklist diff, not vibes).

---

## Phase 3 — `create-agent` skill (govern the existing `agent_propose` socket)

Port shape from `/Users/m/code/cursor/paperclip/skills/paperclip-create-agent/`
(SKILL.md + references/). Target:
`modules/engenty-coordinator/ai/skills/create-agent/SKILL.md` + `references/`.

Workflow to encode (verify each tool/op still exists before writing):
1. **Check the roster first** — `registry_agents_list`; never propose an agent
   whose mandate an existing one covers; prefer widening an existing mandate.
2. **When to propose** — a durable, recurring mandate no current agent owns;
   NOT for one-off tasks (create a task instead) and NOT to work around a tool
   restriction (flag governance instead).
3. **Draft** — mandate template (see 3.1); tools as an allow-list actually
   needed for the mandate (start narrow; widening later is one edit).
4. **Submit** via `agent_propose` — the proposal is governed (human approval),
   mirroring the memory module's proposed→approved pattern. Document the
   pending state: do not assign tasks to a proposed agent.
5. **Handle rejection** — read the reviewer note, revise once, or drop.

### 3.1 `references/mandate-templates.md` — 4 starter templates

Each: name, category (see Phase 4), mandate paragraph, suggested tool
allow-list, memory expectations, done-bar. Suggested four, matching engenty's
capability grouping (NOT departments-as-runtime — these are catalog entries):
- **Commercial follow-up agent** (offers/invoices chasing, category
  "Commercial Agents")
- **Research & monitoring agent** (scheduled digests, web/KB retrieval,
  category "Marketing Agents")
- **Data steward agent** (contacts/KB hygiene dedup proposals, category
  "Operations Agents")
- **Brand & content agent** (drafts on brand guidelines from KB, category
  "Branding Agents")

Also port a trimmed `references/draft-review-checklist.md` (from paperclip's):
mandate specific? overlaps roster? tools minimal? escalation path named?

---

## Phase 4 — Agent categories (capability catalog, not departments)

Position (decided 2026-07-21): group agents like modules are grouped — by
capability. Labels like "Marketing Agents" are shelf labels for the template
catalog/wizard, with zero runtime semantics.

1. **Manifest**: add optional `"category": string` to the agent manifest
   (`$schema engenty/ai-agent-manifest/v1`). Find the manifest zod/validator
   (grep `ai-agent-manifest` under `packages/` and `apps/ai/`) and add the
   optional field there FIRST, then stamp existing `agent.json` files:
   coordinator/copilot/remote → `"System Agents"`; contacts/invoices/offers/
   company-profile → `"Commercial Agents"`; knowledge-base/tasks →
   `"Knowledge & Work Agents"`. (Labels are copy, not code — keep them in one
   constants file if the UI needs to enumerate them.)
2. **Registry**: `registry_agents_list` output gains `category` so the
   coordinator's create-agent skill and the UI can group.
3. **UI**: wherever agents are listed in settings (grep for
   `registry_agents_list` usage in `apps/ui`), group rows by category with the
   same pattern used for module categories.
4. **Wizard tie-in** (do NOT build here): the platform-settings worktree's
   agent wizard consumes these categories as its catalog sections. Just leave
   the seam: categories come from the manifest, templates from Phase 3.1.

---

## Verification / definition of done

- `pnpm check && pnpm typecheck && pnpm test` green at repo root.
- Manual E2E (dev stack): create goal → coordinator heartbeat creates 3 tasks
  where task C has `blocked_by_task_ids: [A, B]`; observe A and B dispatch in
  parallel, C stays `blocked`, C auto-dispatches after both are `done`, parent
  gets the all-subtasks-complete comment.
- Skills registered: coordinator `agent.json` lists `coordinator-workflow`,
  `converting-goals-to-tasks`, `create-agent`; `pnpm --filter @engenty/ui
  generate:plugins` if any UI plugin catalog changed.
- Update the Oasis audit artifact rows "Parallel fan-out" and "Live
  conversational agent-to-agent hand-off" once Phase 1 lands.

## Out of scope (explicitly)

- Live multiplayer co-editing (separate, deliberately deferred).
- Departments as a runtime concept (rejected by design — see Phase 4 position).
- The platform-settings wizard itself (separate worktree, in flight).
- Turning on `ENGENTY_AI_MEMORY_REFLECTION` (separate experiment).
