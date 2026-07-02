# Code Mode adoption — concrete plan

Status: WIP · 2026-07-02 · basis: `@mastra/core` 1.48.0 Code Mode (BETA) + engenty tool catalog

## Why

Code Mode (`createCodeMode({tools, sandbox?, timeout?})` → one `execute_typescript`
tool) lets the model write a single TypeScript program that calls allow-listed tools
as typed `external_<id>()` functions over JSON-RPC into a sandbox. Today the copilot
and task specialist chain many `engenty_tool_execute` round-trips for bulk reads,
cross-module joins, filtering, aggregation — each one a full model turn. Code Mode
collapses those into one turn with real code doing the data work, while every
`external_*` call still executes host-side through the real tool (schema validation,
tracing, request context preserved).

## The allow-list: generate concrete tools from operation contracts

Feeding Code Mode our two generic tools (`engenty_tool_execute`, `engenty_tools_search`)
would defeat it — the generated stubs would be untyped (`input: unknown`). Instead,
**generate one concrete `Tool` per operation contract**:

- Source: `listToolContracts()` / the catalog (`OperationContract`: `operationId`,
  `inputSchema`, `outputSchema`, `description`, `auth.riskLevel`,
  `auth.requiresApproval`, derived `readOnly`). ~100–150 operations exist.
- Each generated tool's `execute` goes through the same `invokeTool` path as
  `engenty_tool_execute` (auth, ALS run context, approval gate untouched).
- Code Mode's stub generator (`jsonSchemaToTsString`) then produces genuinely typed
  `declare function external_<operationId>(input: {...}): Promise<{...}>` signatures
  from the contract schemas — the model sees the real API.
- Scope per agent: `createCodeMode` accepts any subset; multiple code-mode tools with
  distinct `id`s allow least-privilege splits later.

## Phased rollout

**Phase 1 — read-only, task specialist first.**
Allow-list = contracts with `readOnly === true` (riskLevel low, no approval,
idempotent). No approval interaction possible inside the program by construction.
Sandbox: the existing Docker workspace sandbox (Code Mode auto-resolves it from the
agent's workspace execution context — already true for CLI/task presets; the copilot's
`assistant` preset has **no sandbox**, so phase 1 targets the task specialist, or the
copilot gets an explicit sandbox handed to `createCodeMode`).
Measure: turns-per-task and tokens on representative task runs, before/after.

**Phase 2 — copilot, still read-only.** Same allow-list; decide sandbox strategy for
the assistant preset (attach a lightweight sandbox vs. pass one explicitly).

**Phase 3 — writes, carefully.** A gated `external_*` call inside a running program
would block on approval against the default 30s program timeout — suspend semantics
inside Code Mode are the unsolved part. Options, in preference order:
(a) keep approval-requiring ops out of the allow-list permanently — the model falls
back to plain `engenty_tool_execute` for those (fine: writes are rarely the *bulk*
part); (b) allow low/medium-risk writes that don't require approval; (c) pre-granted
operations only (grants already thread through ALS into the execute path).

## Prerequisites / cleanups

- **Explicit `readOnly` on operation definitions.** Today it's derived
  (risk+approval+idempotent); an explicit per-operation override makes allow-lists
  auditable. Small change in `operation-contracts.ts`.
- **Contract → Tool generator** with schema conversion (contracts carry JSON Schema;
  `createTool` wants schemas — direct pass-through or zod conversion).
- Timeout: default 30s; bulk reads over REST may need 60–120s for the program budget.
- Beta caveat: same rule as the other beta surfaces — pin, and live-validate on bumps.

## Relationship to the CLI agent (settled in the overlap doc)

Complementary. Code Mode = in-turn tool orchestration for *this* agent; the CLI agent
= delegated specialist with its own thread, sandbox session, and file artifacts. No
replacement in either direction; long-term the CLI agent could itself get Code Mode
over the catalog for data-heavy briefs.
