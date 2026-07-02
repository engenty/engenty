# docs/wip — planning & target docs

Work-in-progress design docs. Contents here are drafts feeding decisions; once a design
lands, its doc graduates into `docs/content/dev/` (or the owning module's `dev/`).

- [mastra-1.48-overlap.md](./mastra-1.48-overlap.md) — analysis: which Mastra 1.48
  primitives (Heartbeats, Signals, Signal Providers, Notifications, Goals, Code Mode,
  Voice, …) replace, complement, or don't touch Engenty's Goals/Tasks/Routines/Triggers
  framework. Per-area verdict: adopt / keep / hold.
- [agent-ops-target-architecture.md](./agent-ops-target-architecture.md) — the target
  backend design and migration phases: Trigger (schedule|event|manual) → Task template →
  durable task pipeline, on Mastra Heartbeats/Signal Providers/Notifications. Engenty
  stays the domain model + management UI; Mastra is the runtime. No parallel machinery.
- [mastra-memory-adoption.md](./mastra-memory-adoption.md) — we use one memory
  capability (40-message history); adoption order for title generation, working
  memory (adapter is already prepared), tool-call filtering, and Observational
  Memory; why semantic recall is skipped.
- [agent-approvals.md](./agent-approvals.md) — converge four HITL mechanisms onto
  Mastra's native suspend/resume: 1.48's input-aware `requireApproval` predicate
  removes the reason the native gate was disabled; engenty contracts/grants stay the
  policy brain; approvals gain restart survival.
- [file-based-agents.md](./file-based-agents.md) — Mastra's new fs convention vs. our
  `defineModuleAi` convention: keep ours (superset: actions/routines/tenancy), adopt
  `createSkill` and note the pure `assembleAgentFromFsEntry` seam.
- [code-mode-adoption.md](./code-mode-adoption.md) — generate typed per-operation
  tools from the contract catalog, read-only allow-list first (task specialist →
  copilot), writes stay outside Code Mode.
