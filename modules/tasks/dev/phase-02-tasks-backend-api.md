# Phase 2 — tasks backend API

**Status:** done (2026-05) — checklist below retained for audit  
**Depends on:** [phase-01-module-scaffold-and-schema.md](./phase-01-module-scaffold-and-schema.md)  
**Blocks:** phase-03 (Goals — removed 2026-09)

## Intent

Implement DAL, Zod schemas, HTTP routes, and gateway operations for tasks (not goals yet). Emit plugin events on mutations.

---

## Tasks

### Schema layer

- [ ] `src/schema/types.ts` — `Task`, `TaskContext`, `TaskComment`, `TaskSettings`
- [ ] `src/schema/zod.ts` — request/response schemas (snake_case)
- [ ] Reuse domain helpers from `src/domain/task-lifecycle.ts` in DAL

### DAL

- [ ] `src/dal/supabase.ts` — scoped repo factory `(tenantId, scopeId)`
- [ ] Methods: `listTasks`, `getTask`, `createTask`, `updateTask`, `deleteTask`
- [ ] `replaceCollaborators(taskId, userIds)`
- [ ] `addContext`, `listContexts`, `removeContext`
- [ ] `addComment`, `listComments`

### HTTP routes

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/tasks` | Paginated list + filters |
| GET | `/api/tasks/:id` | Detail + collaborators + contexts |
| POST | `/api/tasks` | Create |
| PATCH | `/api/tasks/:id` | Update |
| DELETE | `/api/tasks/:id` | Soft or hard delete (hard OK prelaunch) |
| POST | `/api/tasks/:id/comments` | Add comment |
| GET | `/api/tasks/settings` | Status defs, prefix |
| PUT | `/api/tasks/settings` | Tenant settings |

Register **before** parameterized routes (same UUID guard pattern as projects):

```ts
const UUID_PARAM =
  "{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}";
export const TASK_BY_ID_PATH = `/api/tasks/:id${UUID_PARAM}`;
```

### Gateway operations

```ts
api.registerOperation({ operationId: "tasks_list", ... });
api.registerOperation({ operationId: "tasks_get", ... });
api.registerOperation({ operationId: "tasks_create", ... });
api.registerOperation({ operationId: "tasks_update", ... });
api.registerOperation({ operationId: "tasks_delete", ... });
api.registerOperation({ operationId: "tasks_add_comment", ... });
api.registerOperation({ operationId: "tasks_settings_get", ... });
api.registerOperation({ operationId: "tasks_settings_update", ... });
```

### Events

```ts
engenty.events.emit("tasks.created", { task_id, identifier, ... });
engenty.events.emit("tasks.status_changed", { task_id, from, to, ... });
```

### Tests

- [ ] `src/api/index.test.ts` — route registration (mirror projects pattern)
- [ ] `src/api/gateway-methods.test.ts` — operation handlers
- [ ] DAL integration tests with mocked Supabase or test DB

Example route test:

```ts
it("registers expected HTTP routes", () => {
  registerTasksApi(api, repo);
  expect(routeSignatures).toContain("GET /api/tasks");
  expect(routeSignatures).toContain(`GET ${TASK_BY_ID_PATH}`);
  expect(routeSignatures).toContain("POST /api/tasks");
});
```

### Plugin factory

- [ ] Wire `registerTasksApi` + gateway methods in `src/plugin.ts`

---

## Code — create task handler sketch

```ts
const assignee = normalizeTaskAssignees(input);
const goal_id = resolveTaskGoalId({
  explicit_goal_id: input.goal_id,
  parent_goal_id: parent?.goal_id ?? null,
});
if (input.created_by_agent_type_key) {
  assertAgentTaskGoal({ actorKind: "agent_create", goal_id });
}
const identifier = await allocateTaskIdentifier(repo, settings.identifier_prefix);
// insert task + collaborators + contexts in transaction
```

---

## Exit criteria

- [x] CRUD via HTTP + operations works in local API (`src/api/index.ts`, `gateway-methods.ts`)
- [x] OpenAPI tags include `tasks`
- [x] Contract tests still pass
- [x] `pnpm --filter @engenty/tasks test` green
