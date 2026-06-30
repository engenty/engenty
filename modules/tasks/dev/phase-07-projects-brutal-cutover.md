# Phase 7 — projects brutal cutover

**Status:** backend done (2026-05); UI dedup optional/deferred  
**Depends on:** [phase-06-ai-copilot-integration.md](./phase-06-ai-copilot-integration.md)  
**Blocks:** nothing (program complete)

## Intent

**Only phase that touches `modules/projects`.** Delete embedded task storage; projects becomes a **consumer** of `@engenty/tasks` via `task_contexts`. No migration of old `phase_tasks` rows (prelaunch brutal cutover).

**Handover:** `engenty.plugin.json` `requires: ["module.tasks"]`, `project-tasks-bridge.ts`, DAL wired to `tasks.*`, drop migration `20260522140000_plugin_projects_drop_phase_tasks.sql`, integration contract tests green. **Still duplicated** task UI under `modules/projects/ui/components/*` (dedup deferred).

---

## Hard cutover rules

1. Delete `module_projects.phase_tasks`, `task_team`, `task_comments`, `task_file_links` — not deprecated, **removed**
2. Archive deleted projects task UI/API code to `.trash/projects-phase-tasks/` before removal
3. No compatibility routes that write to both systems
4. Portal + briefing + inbox qualification call `tasks.*` operations
5. Phase 0 contract tests + new projects integration tests must pass

---

## Tasks

### Projects manifest

- [x] Add `"requires": ["module.tasks"]` to `modules/projects/engenty.plugin.json`

### Replace task persistence

**Before (delete):**

```ts
// modules/projects/src/dal/supabase.ts — phase_tasks CRUD
await repo.createPhaseTask({ project_id, phase_id, title, ... });
```

**After:**

```ts
const task = await invokeOperation("tasks_create", {
  title,
  status: "todo",
  goal_id: null, // human project tasks: optional in v1
  contexts: [
    {
      context_type: "project",
      context_id: projectId,
      metadata: { phase_id: phaseId, is_public: isPublic },
    },
  ],
  collaborator_user_ids: teamMemberIds,
}, { auth });
```

### Projects API changes

| Old route | New behavior |
|-----------|--------------|
| `GET /api/projects/:id` (with tasks) | Join tasks via `tasks_list` + `context_type=project` |
| `POST /api/projects/:id/tasks` | `tasks_create` + context link |
| `PATCH /api/projects/tasks/:id` | Proxy to `PATCH /api/tasks/:id` or invoke `tasks_update` |
| `GET /api/projects/tasks` | Filter `tasks.list?context_type=project` |

- [ ] Update `getByIdWithPhasesAndTasks` to hydrate phases with linked tasks
- [ ] Update portal DAL to read public tasks via tasks API
- [ ] Update briefing service to query tasks module (or shared briefing endpoint filtered by project context)

### UI rewiring

- [x] Projects task flows use tasks module via bridge + `/api/tasks` (DAL `invokeTasks`)
- [ ] **Deferred:** Remove duplicated task components from projects (`projects-tasks-*.tsx`, `task-form-dialog.tsx`, etc.) — tasks module UI is canonical but projects copies remain
- [x] Project detail planning tab: fetch tasks by project context (`project-tasks-bridge`, `task_contexts`)
- [x] Projects tasks views call tasks-backed data through bridge

### Inbox qualification

```ts
// projects inbox processor
await invokeOperation("tasks_create", {
  title: candidate.suggested_task_title,
  contexts: [{ context_type: "project", context_id: projectId, metadata: {} }],
});
```

### Migration / DB

- [x] New projects migration: drop task tables; **no** data copy (`20260522140000_plugin_projects_drop_phase_tasks.sql`)
- [x] TRASHBIN.md entry for removed projects task surfaces

### Integration contract tests

- [x] Create `modules/projects/src/contracts/tasks-integration.contract.test.ts`
- [x] Projects → tasks integration scenarios covered in bridge + contract tests
- [x] Port relevant assertions from old `index.test.ts` task assignee tests (bridge maps `task_team`)

Example:

```ts
it("task assignees sync to project_team via projects helper", async () => {
  const task = await createTaskViaProjectsApi(projectId, {
    title: "Review budget",
    team_member_ids: [userId],
  });
  expect(task.identifier).toMatch(/^ENG-\d+$/);
  const project = await getProject(projectId);
  expect(project.project_team?.map((m) => m.user_id)).toContain(userId);
});
```

### Grep verification

```bash
# Must be zero after cutover:
rg -n "phase_tasks|task_team" modules/projects

# Must have hits:
rg -n "tasks\.create|tasks\.list|task_contexts" modules/projects
```

---

## UI sketch — projects after cutover

Projects **Tasks** tab becomes a filtered view:

```text
/module/projects/tasks  →  tasks.list?context_type=project&...
```

Same kanban/table UX; data from tasks module. Project detail phase columns show linked tasks by `metadata.phase_id`.

---

## Exit criteria

- [x] No `phase_tasks` table in schema (drop migration; no references in `modules/projects/src` DAL)
- [x] Projects test suite green including integration contracts (39 tests)
- [x] `@engenty/tasks` contract tests unchanged and green (73 tests)
- [ ] Portal create/view task — **manual smoke recommended**
- [ ] Briefing + inbox → `tasks_create` — inbox processor not verified in handover audit
- [ ] Manual smoke: create project → add phase task → appears in `/module/tasks/list` with project context chip

---

## Rollback note

Prelaunch: rollback = revert git + re-aggregate migrations. Do **not** build runtime dual-read fallback.
