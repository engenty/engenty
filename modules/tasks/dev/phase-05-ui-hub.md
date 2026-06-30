# Phase 5 — UI hub

**Status:** done (2026-05) — checklist below retained for audit  
**Depends on:** [phase-04-checkout-and-live-runs.md](./phase-04-checkout-and-live-runs.md)  
**Blocks:** [phase-06-ai-copilot-integration.md](./phase-06-ai-copilot-integration.md)

## Intent

Ship `/module/tasks` as a first-class module: Briefing, Goals, Tasks list/kanban, task detail. Lift UI from projects **into tasks** (copy/adapt, not shared dependency on projects).

---

## Tasks

### UI plugin

- [ ] `ui/plugin.ts` — routes, i18n namespace `tasks`, admin menu
- [ ] `ui/locales/en.json` + `de.json` — **Tasks** / **Aufgaben**, **Goals** / **Ziele**
- [ ] Register module menu item (section `modules`)

### Routes

| Route | Page |
|-------|------|
| `/module/tasks` | Redirect → `/module/tasks/briefing` or tasks list |
| `/module/tasks/briefing` | Briefing hub |
| `/module/tasks/goals` | Goals list |
| `/module/tasks/goals/:id` | Goal detail |
| `/module/tasks/list` | All tasks (table/kanban) |
| `/module/tasks/:id` | Task detail |

Use `usePageConfig` per list-detail-edit conventions.

### Components (lift from projects)

| Source | Target |
|--------|--------|
| `projects-tasks-table.tsx` | `tasks-list-table.tsx` |
| `projects-tasks-kanban-board.tsx` | `tasks-kanban-board.tsx` |
| `projects-tasks-toolbar.tsx` | `tasks-toolbar.tsx` |
| `task-status-badge.tsx` | same name under tasks |
| `task-form-dialog.tsx` | `task-form-dialog.tsx` |
| `create-task-dialog.tsx` | `create-task-dialog.tsx` |

Add tasks-specific:

- [ ] `live-task-runs-panel.tsx`
- [ ] `task-goal-breadcrumb.tsx`
- [ ] `task-properties-panel.tsx` (primary assignee: user **or** agent picker)
- [ ] `goals-list-page.tsx`, `goal-detail-page.tsx`

### Briefing

- [ ] Port heuristics from `projects-briefing-service.ts` → `tasks-briefing-service.ts`
- [ ] Sections: focus, attention, waiting, stale, suggested actions
- [ ] API: `GET /api/tasks/briefing?mode=personal|oversight`

### TanStack Query

- [ ] `ui/tasks-queries.ts` — `queryOptions` for list, detail, goals, briefing
- [ ] Mutations invalidate on success

### Module tabs chrome

```tsx
// ui/components/tasks-module-tabs.tsx
<Tabs>
  <Tab to="/module/tasks/briefing">{t("tabs.briefing")}</Tab>
  <Tab to="/module/tasks/goals">{t("tabs.goals")}</Tab>
  <Tab to="/module/tasks/list">{t("tabs.tasks")}</Tab>
</Tabs>
```

---

## UI sketches

| Screen | Asset |
|--------|-------|
| Tasks list | [ui-sketch-tasks-list.png](./assets/ui-sketch-tasks-list.png) |
| Task detail | [ui-sketch-task-detail.png](./assets/ui-sketch-task-detail.png) |
| Goals | [ui-sketch-goals-list.png](./assets/ui-sketch-goals-list.png) |

Desktop layout (ASCII):

```text
+----------------------------------------------------------------------------------+
| Tasks                                                                            |
| Briefing | Goals | Aufgaben                                                      |
+----------------------------------------------------------------------------------+
| [Filters] [Sort] [Group: Status]                    [+ New task] [+ New goal]   |
+----------------------------------------------------------------------------------+
| ▼ In progress                                                                    |
|   ● ENG-127  Create live demo for website     [CMO agent]  Live ●    Feb 25     |
| ▼ Todo                                                                           |
|   ○ ENG-126  Write launch checklist           [Marc]                  Mar 01     |
+----------------------------------------------------------------------------------+
```

---

## Exit criteria

- [x] Full CRUD from UI (list, detail inline edit, dedicated edit routes, goals, settings)
- [x] Kanban + table + cards views (`tasks-kanban-board.tsx`, `tasks-list-table.tsx`)
- [x] Task detail shows comments+activity (chat tab), live runs — **no subtask UI** (product change)
- [x] DE + EN locales complete for v1 strings
- [x] UI plugin registered (`ui/plugin.ts`, `@engenty/tasks` in apps/ui)
- [x] **Still no projects task rewiring** during Phases 1–6 (Phase 7 separate)
