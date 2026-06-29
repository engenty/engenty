# AI Harness Concept

`apps/ai/src/ai` is Engenty's owned harness around Mastra, the AI SDK, and the persisted
session model. HTTP routes should stay thin: parse request data, call the harness, and map
known harness errors to status codes.

## Current Steps

- `sessions.ts`: owns session lifecycle, message persistence, generation, and database
  availability checks.
- `agents.ts`: resolves persisted `agent_id` values to Mastra agents.
- `registry/`: additive dynamic capability registry for Phase 1 JIT agent assembly.
- `memory/`: maps Engenty sessions and messages to native Mastra Memory.
- `index.ts`: assembles the harness and exposes small service-level checks such as
  `streamPing`.

## Direction

Build the harness step by step before exposing more HTTP surface:

- Sessions: keep persisted Engenty sessions authoritative and make participant/auth rules
  explicit.
- Agents: centralize agent lookup, metadata, and future per-agent defaults.
- Memory: use Mastra Memory for transcript recall and keep UI-only transcript parts out of
  model-facing history.
- Runs: introduce a first-class run/step abstraction before adding richer streaming or
  generative UI events.
- API: keep `src/api` as transport glue only; no direct agent generation or memory
  construction in route handlers.
