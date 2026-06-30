# Phase 4 — checkout and live runs

**Status:** done (2026-05) — checklist below retained for audit  
**Depends on:** [phase-03-goals-and-lifecycle.md](./phase-03-goals-and-lifecycle.md)  
**Blocks:** [phase-05-ui-hub.md](./phase-05-ui-hub.md)

## Intent

Paperclip-style atomic checkout for agents, release, activity log, and linkage to `ai.agent_session_run` for the **Live runs** panel.

Humans skip checkout; agents must use it.

---

## Tasks

### Schema additions

```sql
create table module_tasks.task_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  agent_session_run_id uuid not null, -- references ai.agent_session_run(id)
  role text not null check (role in ('checkout', 'work', 'review')),
  created_at timestamptz not null default now()
);

create table module_tasks.task_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references core.users(id) on delete set null,
  actor_agent_type_key text,
  created_at timestamptz not null default now()
);

alter table module_tasks.tasks
  add constraint tasks_checkout_run_fk
  foreign key (checkout_run_id) references ai.agent_session_run(id) on delete set null;
```

### Checkout / release routes

| Method | Path |
|--------|------|
| POST | `/api/tasks/:id/checkout` |
| POST | `/api/tasks/:id/release` |
| GET | `/api/tasks/:id/runs` |
| GET | `/api/tasks/:id/activity` |

Operations: `tasks_checkout`, `tasks_release`, `tasks_list_runs`, `tasks_list_activity`

### Checkout SQL (atomic)

```sql
update module_tasks.tasks
set
  status = 'in_progress',
  primary_assignee_kind = 'agent',
  primary_assignee_agent_type_key = $agent_type_key,
  checkout_run_id = $run_id,
  started_at = coalesce(started_at, now()),
  updated_at = now()
where id = $task_id
  and tenant_id = $tenant_id
  and scope_id = $scope_id
  and status = any($expected_statuses)
  and (
    checkout_run_id is null
    or checkout_run_id = $run_id
  )
returning *;
```

- [ ] 409 on conflict with current owner/status in body
- [ ] Idempotent success if same run already holds checkout
- [ ] `tasks_release` clears checkout, sets status `todo` (or keep `in_progress` if human-owned — document choice: **→ todo**)

### Activity events

Record on: status change, assignee change, checkout, release, comment.

```ts
await repo.appendActivity({
  task_id,
  event_type: "tasks.checked_out",
  payload: { run_id, agent_type_key },
  actor_agent_type_key: agent_type_key,
});
```

### Tests

- [ ] Concurrent checkout — exactly one wins (mock transaction)
- [ ] Agent cannot PATCH `in_progress` without checkout (403)
- [ ] Human can PATCH `in_progress` without checkout
- [ ] Contract tests still pass

---

## UI sketch reference

[assets/ui-sketch-task-detail.png](./assets/ui-sketch-task-detail.png) — **Live runs** panel:

```tsx
// Phase 5 component sketch
<LiveTaskRunsPanel taskId={task.id} runs={runs} onStop={stopRun} />
```

---

## Exit criteria

- [x] Checkout/release operations work; 409 tested (`src/dal/checkout.test.ts`)
- [x] Activity feed populated (`task_activity`, `task-activity-feed.tsx`, `format-activity*.ts`)
- [x] `task_runs` links to real `ai.agent_session_run` rows in dev (`live-task-runs-panel.tsx`)
- [x] Contract tests pass
