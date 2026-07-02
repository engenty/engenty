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
