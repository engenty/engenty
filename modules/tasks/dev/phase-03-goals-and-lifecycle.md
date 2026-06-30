# Phase 3 — goals and lifecycle

**Status:** done (2026-05) — checklist below retained for audit  
**Depends on:** [phase-02-tasks-backend-api.md](./phase-02-tasks-backend-api.md)  
**Blocks:** [phase-04-checkout-and-live-runs.md](./phase-04-checkout-and-live-runs.md)

## Intent

Goals CRUD, task status transition enforcement, identifier allocation, automatic timestamps on terminal/active transitions.

---

## Tasks

### Goals API

| Method | Path |
|--------|------|
| GET | `/api/tasks/goals` |
| GET | `/api/tasks/goals/:id` |
| POST | `/api/tasks/goals` |
| PATCH | `/api/tasks/goals/:id` |
| DELETE | `/api/tasks/goals/:id` |

Operations: `goals_list`, `goals_get`, `goals_create`, `goals_update`, `goals_delete`

- [ ] Enforce `assertGoalDepth` on create
- [ ] Enforce `canTransitionGoalStatus` on patch
- [ ] Include `linked_task_count` on list (aggregate query)

### Task lifecycle in DAL

- [ ] `transitionTaskStatus(taskId, to, actor)` — calls `canTransitionTaskStatus`
- [ ] Set `started_at` on first `→ in_progress`
- [ ] Set `completed_at` on `→ done`
- [ ] Set `cancelled_at` on `→ cancelled`
- [x] Terminal tasks can be reopened/edited (product change; contract `allows reopening from terminal statuses`)

### Identifier allocation

- [ ] `src/dal/task-identifier.ts` — atomic sequence increment
- [ ] Assign identifier on create (never on update)
- [ ] Settings: `identifier_prefix` default `ENG`

### Goal ancestry in responses

```ts
// tasks.get / tasks.list optional ?include_goal_ancestry=true
type GoalAncestryItem = { id: string; title: string; status: GoalStatus };
// [leaf, parent, ..., root]
```

### Tests

- [ ] Goal depth rejection
- [ ] Terminal task rejection
- [ ] Identifier monotonic increment per tenant+prefix
- [ ] Goal inherit on subtask create (contract alignment)

---

## UI sketch reference

[assets/ui-sketch-goals-list.png](./assets/ui-sketch-goals-list.png)

Target routes (Phase 5):

- `/module/tasks/goals` — list
- `/module/tasks/goals/:id` — detail with linked tasks

---

## Exit criteria

- [x] Goals CRUD + task lifecycle enforced in API
- [x] `ENG-1`, `ENG-2`, … allocated correctly (`src/dal/task-identifier.ts`)
- [x] Contract tests pass
- [x] Agent create without `goal_id` returns 400
