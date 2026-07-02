# Mastra Memory — what we use, what we don't, what to adopt

Status: WIP · 2026-07-02 · basis: `@mastra/memory` 1.22.0 / `@mastra/core` 1.48.0 (installed, `.d.ts`-verified)

## Current state

Engenty chat memory is `new Memory({ options: { lastMessages: 40 }, storage:
EngentySessionMemoryStorage })` ([concrete-memory.ts](../../apps/ai/src/ai/memory/concrete-memory.ts)).
That uses exactly **one** capability — message history — plus the implicit default
`filterIncompleteToolCalls: true`. Our adapter maps threads/messages onto
`ai.thread` / `ai.thread_message` and already implements the resource methods
(`getResourceById/saveResource/updateResource`), including a `workingMemory` column
that is **never populated** — a ready-made seam.

Everything below is unused surface, ordered by adoption value.

## 1. Thread title generation — QUICK WIN

`options.generateTitle: { model, instructions? }` → one async LLM call per new thread,
needs only `updateThread` (our adapter supports it as-is). We currently have no title
synthesis at all; the chat list shows the raw first message. Cheapest possible win.

## 2. Working memory — HIGH VALUE, adapter is already ready

A persistent, agent-editable profile injected into the system prompt each turn,
updated by the agent via an auto-registered `updateWorkingMemory` tool.

```ts
workingMemory: {
  enabled: true,
  scope: 'resource',            // default — per USER, across all threads
  schema: <zod profile schema>, // merge semantics; or template: <markdown> (replace)
}
```

- **Resource scope** = cross-thread user personalization ("prefers German, works on
  project X, role Y") — the thing the copilot conspicuously lacks today.
- Requires the three resource methods on the storage adapter — **ours already has
  them**, with the unused `workingMemory` field waiting. No vector store, no embedder.
- Costs: agent occasionally spends a tool call updating the profile.

Recommendation: adopt with a small Zod schema (not free-form template) so the profile
stays bounded and inspectable; surface it read-only in the UI (settings → "what the
assistant knows about you") with a reset button.

## 3. Observational Memory (OM) — THE STRATEGIC ONE, needs storage work

Mastra's flagship long-context memory (docs: "recommended", more accurate *and*
cheaper than semantic recall): a background **Observer** model compresses raw history
into a dense observation log; a **Reflector** condenses the log across generations.
Active observations replace raw history → stable, cacheable prompt prefix, 5–40×
compression. Extras we'd get: current-task tracking, suggested responses, optional
thread titles, custom extractors (incl. auto-managed working memory).

**The catch:** OM requires the MemoryStorage to declare
`supportsObservationalMemory = true` and implement ~17 OM record methods
(`getObservationalMemory`, `updateActiveObservations`, buffered-swap methods, flags,
…). Without them, `observationalMemory: true` is a **silent no-op** (the processor
factory returns null). `@mastra/pg` 1.14.3 implements the full set.

Adoption path that keeps our thread/message ownership: extend
`EngentySessionMemoryStorage` with the OM methods, **delegating the
`ObservationalMemoryRecord` persistence internally to the pg memory domain** (we
already run `MastraCompositeStore` + PostgresStore; OM records are runtime state, not
business data — no reason to hand-model them). Config: default model
`google/gemini-2.5-flash` (needs a fast 128k model via our gateway), thread scope only
(resource scope is experimental).

Where it pays: long copilot threads (context bloat is our cost ceiling today) and
long-running task-specialist runs.

## 4. Semantic recall — PROBABLY SKIP in favor of OM

Vector RAG over past messages (`semanticRecall: { topK, messageRange, scope }` +
`vector: PgVector` + embedder). We have pgvector wired for workspace/RAG search
already, so it's *feasible* — but it adds an embedding call before every turn and
per-message indexing, and Mastra's own docs now position OM as more accurate and
cheaper. If cross-thread recall is needed later, OM's `retrieval: { vector: true }`
covers it inside the OM model. Revisit only if OM adoption stalls.

## 5. Memory processors — ADOPT OPPORTUNISTICALLY

The legacy `processors:` option now throws; the replacement is agent-level
input/output processors. Free, storage-independent built-ins worth wiring where they
hurt today: `TokenLimiter` (hard prompt budget), `ToolCallFilter` (strip noisy tool
transcripts from history — our `engenty_tool_execute` results can be huge). Guardrail
processors (pii-detector, prompt-injection-detector, moderation) are available when we
want them; an aborting output processor also prevents persistence.

## 6. Small gaps worth knowing (not adopting now)

- `readOnly: true` memory for router/sub-agent runs that should read but not write.
- Thread cloning (`cloneThread` — our adapter would need to implement it; base throws).
- `deleteMessages` / `listMessagesByResourceId` — base throws; implement when a
  feature needs them (message-level redaction, cross-thread views).

## Suggested order

| # | Item | Effort | Dependency |
|---|---|---|---|
| 1 | `generateTitle` | XS | none — adapter works as-is |
| 2 | Working memory (resource scope, schema form) | S | populate existing adapter field; UI read-only view |
| 3 | `ToolCallFilter` + `TokenLimiter` processors | S | none |
| 4 | Observational Memory (thread scope) | M–L | OM methods on adapter delegating to pg memory domain |
| 5 | Semantic recall | — | skip; OM retrieval covers it |
