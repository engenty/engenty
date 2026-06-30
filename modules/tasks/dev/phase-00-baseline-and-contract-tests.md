# Phase 0 — baseline and contract tests

**Status:** done (2026-05)  
**Depends on:** nothing — **start here**  
**Blocks:** [phase-01-module-scaffold-and-schema.md](./phase-01-module-scaffold-and-schema.md)

## Intent

Lock behavior before schema or UI. Contract tests in `modules/tasks` must still pass at Phase 7 when `modules/projects` consumes tasks via `task_contexts`.

**Rule:** Do not touch `modules/projects` task code in this phase (grep gate below).

---

## Tasks

- [x] Add `src/domain/task-lifecycle.ts` — transitions, identifier, assignee, goal resolve
- [x] Add `src/domain/goal-lifecycle.ts` — goal transitions, depth limit
- [x] Add `src/contracts/task-workflow.contract.test.ts` — platform contracts
- [x] Run `pnpm --filter @engenty/tasks test` — all green
- [ ] Document projects freeze in team channel / PR description (process; not code)
- [x] Add Phase 7 todo block for `projects` integration contract tests — `modules/projects/src/contracts/tasks-integration.contract.test.ts`

---

## Contract test inventory

| Test group | File | Must hold after Phase 7 |
|------------|------|-------------------------|
| Identifier `ENG-N` | `task-workflow.contract.test.ts` | Yes — same formatter in DAL |
| Primary + collaborators | same | Yes — projects assignee picker uses ops |
| Agent checkout → `in_progress` | same | Yes — agent heartbeat |
| Human direct `in_progress` | same | Yes — UI status dropdown |
| Goal inherit + agent requires goal | same | Yes |
| Goal depth ≤ 3 | same | Yes |
| Projects integration (todo) | add in Phase 7 | `projects` consumer |

Run:

```bash
pnpm --filter @engenty/tasks test
```

---

## Code — task identifier allocation (target DAL)

```ts
// modules/tasks/src/dal/task-identifier.ts (Phase 3)
export async function allocateTaskIdentifier(
  repo: ScopedRepo,
  prefix: string
): Promise<string> {
  const sequence = await repo.nextTaskSequence(); // atomic increment per tenant
  return formatTaskIdentifier(prefix, sequence);
}
```

SQL sketch (Phase 1 migration):

```sql
create table module_tasks.task_identifier_sequences (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  prefix text not null default 'ENG',
  last_value integer not null default 0,
  primary key (tenant_id, scope_id, prefix)
);
```

---

## Code — checkout conflict response (Phase 4)

```ts
// POST /api/tasks/:id/checkout
if (updatedRowCount === 0) {
  return c.json(
    {
      error: "task_checkout_conflict",
      current_status: existing.status,
      current_assignee_kind: existing.primary_assignee_kind,
      checkout_run_id: existing.checkout_run_id,
    },
    409
  );
}
```

Agent rule (skill, Phase 6): **never retry 409** — pick another task.

---

## Grep gates (run now; re-run before Phase 7)

Confirm no accidental parallel task work in projects during Phases 1–6:

```bash
# Should only change in Phase 7:
rg -n "phase_tasks|task_team|task_comments" modules/projects --glob '!**/*.md'

# New tasks module should grow:
rg -n "module_tasks|@engenty/tasks" modules/tasks apps
```

Expected during Phases 1–6: **zero** new task feature commits under `modules/projects/src` or `modules/projects/ui` (bugfixes only if blocking).

---

## Phase 7 integration test stub (create file in Phase 7)

```ts
// modules/projects/src/contracts/tasks-integration.contract.test.ts
describe("projects task consumer contract", () => {
  it("POST tasks.create + task_contexts links task to project phase", async () => {
    const task = await invokeOperation("tasks_create", {
      title: "Kickoff deck",
      goal_id: goalId,
      contexts: [
        {
          context_type: "project",
          context_id: projectId,
          metadata: { phase_id: phaseId, is_public: false },
        },
      ],
    });
    expect(task.identifier).toMatch(/^ENG-\d+$/);
  });
});
```

---

## Exit criteria

- [x] `pnpm --filter @engenty/tasks test` passes (contract suite)
- [x] README + GOAL + PLAN linked from `dev/README.md`
- [x] Grep gate documented; projects task freeze acknowledged (Phase 7 cutover completed)
- [x] UI sketches present in `dev/assets/*.png`
