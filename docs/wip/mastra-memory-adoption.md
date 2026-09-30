# Mastra Memory — what we use, what we don't, what to adopt

Status: WIP · updated 2026-09-24 · written against `@mastra/memory` 1.26.2 /
`@mastra/core` 1.59.0; installed today: `@mastra/memory` 1.30.0 /
`@mastra/core` 1.67.0 (`apps/ai/package.json`)

## Current state

Engenty chat uses message history, generated thread titles and the two OM
layers below. Facts kept on purpose are memory entries (`ai.memory_entries`,
one row per fact, scoped agent / user / space / company) — not Mastra working
memory. `EngentySessionMemoryStorage` maps
threads/messages onto `ai.thread` / `ai.thread_message`; Mastra runtime records
stay in PostgresStore's `ai.mastra_*` tables.

## 1. Thread title generation — QUICK WIN

`options.generateTitle: { model, instructions? }` → one async LLM call per new thread,
needs only `updateThread` (our adapter supports it as-is). We currently have no title
synthesis at all; the chat list shows the raw first message. Cheapest possible win.

## 2. Working memory — OURS, NOT MASTRA'S (2026-09-28)

Mastra's working memory holds one document per resource; we need one per
memory key (user, Space, company, agent). So `workingMemory: { enabled: false }`
and `ai.working_memory` holds a small fixed schema per scope
(`packages/ai-core/src/memory/working-memory.ts`). The thread Observer still
fills it — through a custom inline `Extractor` (`apps/ai/src/ai/memory/
working-memory.ts`), so no extra model call — alongside the agent's
`working_memory_set` and people's edits. Dated facts are memory entries.

## 3. Observational Memory (OM) — ADOPTED FOR CHAT

Mastra's flagship long-context memory (docs: "recommended", more accurate *and*
cheaper than semantic recall): a background **Observer** model compresses raw history
into a dense observation log; a **Reflector** condenses the log across generations.
Active observations replace raw history → stable, cacheable prompt prefix, 5–40×
compression. Extras we'd get: current-task tracking, suggested responses, optional
thread titles, custom extractors.

Engenty keeps `ai.thread` / `ai.thread_message` ownership and delegates Mastra's
OM records to the PostgresStore memory domain. Chat uses two observation layers:

- native **thread-scoped OM** compresses each conversation independently;
- an inject-only shared Observer contributes a state-signal snapshot keyed
  agent × user for copilot, or agent × space for staff agents.

The generic per-agent `agentScope` classification selects the shared key:
`personal` → user and `shared` → space. It is part of `AgentConfig` and is
persisted for database-created agents.

Memory entries also use a state signal. The volatile shared layers therefore
do not rewrite the provider's cacheable system prefix. Native
resource-scope OM remains unused: it is experimental, processes all threads
together, and can blur unfinished work between simultaneous conversations.

`ENGENTY_AI_OBSERVATIONAL_MEMORY=false` disables both layers. The shared layer
is opt-in on top of that (`ENGENTY_AI_SHARED_OBSERVATIONS=true`) and observes
in the background after the run ends. Task-job threads remain outside this
rollout.

## 4. Semantic recall — BUILT, OFF BY DEFAULT

Shipped behind a flag: `ENGENTY_AI_SEMANTIC_RECALL=true` plus a configured
workspace vector store turns it on, thread-scoped only
(`apps/ai/src/ai/memory/semantic-recall.ts`). The reasoning below is why it
stays off by default.

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
| 2 | ~~Working memory~~ — removed, see §2 | — | replaced by memory entries |
| 3 | `ToolCallFilter` + `TokenLimiter` processors | S | none |
| 4 | Observational Memory (thread scope) | M–L | OM methods on adapter delegating to pg memory domain |
| 5 | Semantic recall | — | built behind `ENGENTY_AI_SEMANTIC_RECALL`, off by default |
