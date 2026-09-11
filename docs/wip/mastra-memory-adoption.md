# Mastra Memory — what we use, what we don't, what to adopt

Status: WIP · updated 2026-08-19 · basis: `@mastra/memory` 1.26.2 /
`@mastra/core` 1.59.0 (installed, `.d.ts`-verified)

## Current state

Engenty chat uses message history, generated thread titles, resource-scoped
working memory, and the two OM layers below. `EngentySessionMemoryStorage` maps
threads/messages onto `ai.thread` / `ai.thread_message`; Mastra runtime records
stay in PostgresStore's `ai.mastra_*` tables.

## 1. Thread title generation — QUICK WIN

`options.generateTitle: { model, instructions? }` → one async LLM call per new thread,
needs only `updateThread` (our adapter supports it as-is). We currently have no title
synthesis at all; the chat list shows the raw first message. Cheapest possible win.

## 2. Working memory — ADOPTED

A persistent per-user profile delivered as a state signal. The main agent does
not receive `updateWorkingMemory`; thread OM's Observer maintains the bounded
profile.

```ts
workingMemory: {
  enabled: true,
  agentManaged: false,
  scope: 'resource',
  schema: <zod profile schema>,
  useStateSignals: true,
}
```

- **Resource scope** = cross-thread user personalization ("prefers German, works on
  project X, role Y") — the thing the copilot conspicuously lacks today.
- Requires the three resource methods on the storage adapter — **ours already has
  them**, with the unused `workingMemory` field waiting. No vector store, no embedder.
- Costs: Observer work can update the profile during observation cycles.

The schema stays deliberately small; durable, reviewable facts remain
`memory_save` records rather than profile fields.

## 3. Observational Memory (OM) — ADOPTED FOR CHAT

Mastra's flagship long-context memory (docs: "recommended", more accurate *and*
cheaper than semantic recall): a background **Observer** model compresses raw history
into a dense observation log; a **Reflector** condenses the log across generations.
Active observations replace raw history → stable, cacheable prompt prefix, 5–40×
compression. Extras we'd get: current-task tracking, suggested responses, optional
thread titles, custom extractors (incl. auto-managed working memory).

Engenty keeps `ai.thread` / `ai.thread_message` ownership and delegates Mastra's
OM records to the PostgresStore memory domain. Chat uses two observation layers:

- native **thread-scoped OM** compresses each conversation independently;
- an inject-only shared Observer contributes a state-signal snapshot keyed
  agent × user for copilot, or agent × space for staff agents.

The generic per-agent `agentScope` classification selects the shared key:
`personal` → user and `shared` → space. It is part of `AgentConfig` and is
persisted for database-created agents.

Working memory also uses state signals. The volatile shared/profile layers
therefore do not rewrite the provider's cacheable system prefix. Native
resource-scope OM remains unused: it is experimental, processes all threads
together, and can blur unfinished work between simultaneous conversations.

`ENGENTY_AI_OBSERVATIONAL_MEMORY=false` disables both layers. Task-job threads
remain outside this rollout.

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
