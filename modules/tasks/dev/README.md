# Tasks module — dev docs index

Planning and phased implementation for `@engenty/tasks`.

**Handover (2026-05-23):** Phases 0–6 and Phase 7 backend cutover are **implemented**. See [PLAN.md § Handover status](./PLAN.md#handover-status-2026-05-23) for open tails (Studio smoke, projects UI dedup, optional apps/ai auto-checkout).

Each phase file has **`Status: done`** (or backend done for phase 7) and **exit criteria checked**. Inline task checklists under `## Tasks` are **audit-only** — use exit criteria + PLAN handover table as source of truth.

**Module conventions:** [../AGENTS.md](../AGENTS.md) (design rules, no subtasks in UI, projects bridge).

| Doc | Purpose |
|-----|---------|
| [GOAL.md](./GOAL.md) | North star, locked decisions, success criteria |
| [PLAN.md](./PLAN.md) | Phase index, sequencing rules, verification |
| [phase-00-baseline-and-contract-tests.md](./phase-00-baseline-and-contract-tests.md) | **Start here** — contract tests + grep gates |
| [phase-01-module-scaffold-and-schema.md](./phase-01-module-scaffold-and-schema.md) | Package, migrations, mandatory plugin |
| [phase-02-tasks-backend-api.md](./phase-02-tasks-backend-api.md) | DAL, routes, operations |
| [phase-03-goals-and-lifecycle.md](./phase-03-goals-and-lifecycle.md) | Goals + status machine + identifiers |
| [phase-04-checkout-and-live-runs.md](./phase-04-checkout-and-live-runs.md) | Agent checkout, runs, activity |
| [phase-05-ui-hub.md](./phase-05-ui-hub.md) | Module UI |
| [phase-06-ai-copilot-integration.md](./phase-06-ai-copilot-integration.md) | AI skills, agents, tools |
| [phase-07-projects-brutal-cutover.md](./phase-07-projects-brutal-cutover.md) | Projects re-integration |

**Assets:** [assets/](./assets/) — UI wireframe PNGs

**Contract tests:** `../src/contracts/` and `../src/domain/`
