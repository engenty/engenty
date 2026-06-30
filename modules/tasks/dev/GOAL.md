# Tasks module — architecture goal

**Status:** implemented (2026-05); optional tails in [PLAN.md](./PLAN.md#handover-status-2026-05-23)  
**Module:** `modules/tasks` (`@engenty/tasks`)  
**Product line:** *Manage business goals — not pull requests.*

---

## North star

Engenty needs a **stable work artefact** that humans and agents share: the **Task** (Aufgabe). Strategic context lives in **Goals** (Ziele). Everything else — project phases, copilot runs, vault files, inbox items — **links to** tasks; it does not own them.

Paperclip proved the pattern: long-running agents need durable tasks with lifecycle, checkout, and traceable “why.” Engenty’s difference: **human ↔ agent collaboration** on the same row, not an agent-only control plane with humans as “the board.”

---

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| **Primary assignee** | Exactly one primary (`user` \| `agent` \| `none`); optional **collaborators** (multi-user) |
| **Human-readable id** | Tenant-scoped identifier, e.g. `ENG-142` (`{prefix}-{sequence}`) |
| **Host placement** | **Mandatory core module** (declare in `apps/core/src/plugins/mandatory-plugins.ts` alongside `vault`) |
| **Projects cutover** | **Brutal** — no dual-write, no parallel task editing in `modules/projects` during build-out; re-integrate in **Phase 7 only** |
| **Goal linkage** | Soft for human-created tasks in v1; **required** for agent-created tasks |
| **Subtasks** | ~~One level deep in v1~~ **Deferred / not shipped in UI** — `parent_id` exists in schema/API only; no subtask UX |
| **Agent start work** | `tasks_checkout` required for agents; humans may set `in_progress` directly |

---

## What we are building

```
┌────────────────────────────────────────────────────────────┐
│  modules/tasks (mandatory platform module)                 │
│  goals · tasks · statuses · comments · checkout · runs     │
│  ops: tasks.* · goals.* · events: tasks.*                  │
│  UI: /module/tasks · /module/tasks/goals · /module/tasks/:id │
└───────────────────────────┬────────────────────────────────┘
                            │ task_contexts (plugin links)
              ┌─────────────┴─────────────┐
              ▼                           ▼
         projects                      inbox
         (phase link)                (qualify)
```

### Task lifecycle (canonical)

```
backlog ⇄ todo ──checkout (agents)──► in_progress ⇄ in_review ──► done
   │         │                           │              │
   └─────────┴──── blocked ◄─────────────┴──────────────┘
                      │
                 cancelled
```

Terminal: `done`, `cancelled`.

### Mandatory module declaration (target)

```ts
// apps/core/src/plugins/mandatory-plugins.ts
{
  pluginId: "tasks",
  capabilities: ["module.tasks", "platform.work"],
  hostHealthRelevant: true,
  reason:
    "Tasks provide the canonical work artefact for human and agent collaboration across Engenty modules.",
}
```

---

## What we are not building (v1)

- Org charts, CEO approval gates, agent hire/terminate (Paperclip-specific)
- Asana parity: portfolios, custom fields, multi-home, dependency graphs, sprints
- Dual-write or migration scripts from `phase_tasks` (prelaunch: truncate / rebuild)
- Parallel task APIs in `modules/projects` while `modules/tasks` is in flight

---

## Success criteria (program complete)

- [ ] Agent heartbeat: `tasks_list` → `tasks_checkout` → work → comment → `tasks_update` (status `done`) without touching project tables — **ops + skill exist; manual Studio smoke open** (phase 6)
- [x] Human manages the same task in `/module/tasks/:id`; sees **Live runs** when an agent holds checkout
- [x] Projects phase board reads tasks via `task_contexts` only (`context_type: "project"`) — `project-tasks-bridge`, drop `phase_tasks` migration
- [x] Contract tests in `modules/tasks/src/contracts/` pass unchanged after Phase 7 projects cutover
- [x] `pnpm --filter @engenty/tasks test` and `pnpm --filter @engenty/projects test` green
- [x] DE + EN locales: **Ziele** / **Aufgaben**

### Product changes after plan (handover)

- **No subtasks / sub-goals in UI** — flat tasks and goals only (`parent_id` unused in product surfaces).
- **Done/cancelled tasks editable** — lifecycle allows reopening from terminal statuses (see contract test `allows reopening from terminal statuses`).
- **Comments + activity** — single chat-style tab (`task-comments-activity-tabs.tsx`), not separate legacy panels.
- **Activity feed** — card rows, status pills single-line; see [AGENTS.md](../AGENTS.md) design rules.

---

## UI reference sketches

| Sketch | File |
|--------|------|
| Tasks list (grouped by status) | [assets/ui-sketch-tasks-list.png](./assets/ui-sketch-tasks-list.png) |
| Task detail (live runs + properties) | [assets/ui-sketch-task-detail.png](./assets/ui-sketch-task-detail.png) |
| Goals list | [assets/ui-sketch-goals-list.png](./assets/ui-sketch-goals-list.png) |

Inspired by [Paperclip](https://paperclip.ing/) task/issue UX; Engenty shell chrome (borderless canvas, blended module tabs).

---

## Related docs

- [PLAN.md](./PLAN.md) — phase index and sequencing rules
- [phase-00-baseline-and-contract-tests.md](./phase-00-baseline-and-contract-tests.md) — start here
- [docs/dev/module-copilot-integration.md](../../../docs/dev/module-copilot-integration.md)
- [docs/dev/react-query-conventions.md](../../../docs/dev/react-query-conventions.md)
