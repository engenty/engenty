# Tasks module — agent notes

Planning lives in [`dev/`](./dev/README.md). **Handover:** [PLAN.md § Handover status](./dev/PLAN.md#handover-status-2026-05-23) (phases 0–7, open tails).

## Design rules

- **Comments tab vs Activity tab:** Comments tab is a canvas chat thread (full comment bodies, page scroll — no inner `max-h` scroll trap). Activity tab is the card ledger. The comment composer docks to the viewport bottom when its in-flow position is off-screen, then snaps back into normal flow when scrolled into view (`useDockedColumnFooter`).
- **Comment audience styling:** Task team comments (assignee, creator, collaborators) render **on canvas** — no card shell. Agent and non-team (“guest”) comments render as **elevated cards** (`bg-card shadow-sm`) so they read as outside notes.
- **Card items use `bg-card` only — no border.** Never add `border` or `border-border/*` classes to activity `<li>` card elements or property sidebar rows (`TaskPropertyRow`). Use `shadow-sm` for elevation. Scroll regions that contain cards need horizontal padding (`px-1.5` / `-mx-1.5`) so shadows are not clipped by `overflow-y-auto`.
- **Status pill rows must be single-line.** Status change messages use `@container` on the activity card: `@min-[26rem]:` keeps actor + status pills + time on one flex row; below that breakpoint use two lines (name/time, then action). Pills use `gap-x-1.5`, compact `text-xxs`, no `truncate`.

- **Canonical work artefact:** `module_tasks.tasks` with identifier `ENG-N`
- **Goals:** `module_tasks.goals` (Ziele)
- **Plugin links:** `task_contexts` — projects uses `context_type: "project"`
- **Do not** add task tables to other modules; call `tasks.*` operations
- **Projects cutover:** Phase 7 only — see [phase-07-projects-brutal-cutover.md](./dev/phase-07-projects-brutal-cutover.md)

Contract tests: `src/contracts/task-workflow.contract.test.ts`
