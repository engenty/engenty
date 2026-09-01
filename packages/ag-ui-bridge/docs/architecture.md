---
title: Architecture
description: Package boundaries, neighborhood, and source layout for @engenty/ag-ui-bridge.
---

# Architecture

`@engenty/ag-ui-bridge` is a **thin, isomorphic protocol package**. It validates and extends official AG-UI — it does not run agents, render chat, or own session persistence.

## Neighborhood

| Package / app | Role |
|---------------|------|
| **`@ag-ui/core` / `@ag-ui/encoder`** | Upstream wire types, event schemas, SSE encoder |
| **`@engenty/ag-ui-bridge`** | Engenty re-exports + extension validators (this package) |
| **`@engenty/app-shell`** | Publishes `AgentUiStateSnapshotV1`, registers frontend tools |
| **`@engenty/ai-ui`** | AG-UI conversation state, `apps/ai` transport, chat chrome |
| **`apps/ai`** | Run harness, SSE streams, native frontend-tool suspend/resume |
| **`@engenty/ai-core`** | Prompt context from UI state, tenant frontend-tool gating |
| **`modules/*`** | Define module frontend tools via `createFrontendToolDefinition` |

```text
app-shell ──snapshot/tools──► ai-ui ──RunAgentInput──► apps/ai
                                  │                        │
                                  │                        ▼ SSE (official events)
                                  └◄──── parseAgUiSseChunk ┘
ag-ui-bridge ◄── shared types/validators ──► ai-core (prompt + gating)
```

## Hard boundary rules

1. **Official AG-UI first** — use upstream `RunAgentInput`, `AGUIEvent`, `Tool`, `EventSchemas`, and `EventEncoder` before inventing Engenty-owned wire shapes.
2. **Extensions in extension slots** — Engenty fields live in `Tool.metadata.engenty`, `RunAgentInput.state`, `forwardedProps`, `context`, namespaced `CUSTOM` events, or session metadata — not parallel event unions. Sub-agent sync delegation streams `CUSTOM` `engenty.sub_agent.progress` with `{ toolCallId, line, messageId?, toolName? }` while the parent run is active.
3. **React-free** — no components, hooks, or DOM access.
4. **No module imports** — `apps/ai` merges server and client tool catalogs without importing `modules/*`.

## Source map

| File | Exports (examples) |
|------|---------------------|
| `index.ts` | Public barrel |
| `json-value.ts` | `JsonValue`, `JsonPatchOperation`, `isJsonValue` |
| `agent-ui-state.ts` | `AgentUiStateSnapshotV1`, `agentUiSharedStateSignature`, `assertAgentUiStateSnapshotWithinLimit` |
| `frontend-tools.ts` | `createFrontendToolDefinition`, `FrontendToolCallRequest`, `isFrontendToolDefinition` |
| `ag-ui-sse.ts` | `encodeAgUiSseEvent`, `createAgUiSseParser` |
| `engenty-open-interrupt.ts` | `readAgUiOpenInterrupt`, `buildFrontendToolOpenInterrupt`, `FrontendToolInterruptPayload` |
| `validate-frontend-tool-input.ts` | `getFrontendToolInputValidationError` |
| `agent-turn-message.ts` | `AgentTurnMessageLike` — minimal transcript row for status ticker (UI boundary type) |

## Verification

```bash
pnpm --filter @engenty/ag-ui-bridge test
pnpm --filter @engenty/ai test
pnpm --filter @engenty/ai-ui test
```

Compatibility expectations and open gaps: [Compatibility](./compatibility).
