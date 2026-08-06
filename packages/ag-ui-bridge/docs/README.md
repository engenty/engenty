---
title: "@engenty/ag-ui-bridge"
description: Official AG-UI wire contracts, Engenty UI state snapshots, frontend-tool metadata, SSE helpers, and interrupt metadata — React-free.
---

# @engenty/ag-ui-bridge

`@engenty/ag-ui-bridge` is the **protocol boundary** between Engenty and the official AG-UI TypeScript SDK. It re-exports `@ag-ui/core` / `@ag-ui/encoder`, adds Engenty-only extension fields in the right AG-UI locations, and ships validators plus SSE helpers.

This package is **React-free**. Import it from `@engenty/app-shell`, `@engenty/ai-ui`, `@engenty/ai-core`, and `apps/ai` without pulling UI components.

Runtime orchestration, conversation state, and chat chrome live elsewhere — see [Architecture](./architecture).

## Package layout

Source lives under `packages/ag-ui-bridge/src/`:

| Area | Path | Purpose |
|------|------|---------|
| **Official re-exports** | `index.ts` | `@ag-ui/core` types/schemas; `@ag-ui/encoder` `EventEncoder` |
| **JSON helpers** | `json-value.ts` | `JsonValue`, `JsonPatchOperation`, runtime validators |
| **Agent UI state** | `agent-ui-state.ts` | `AgentUiStateSnapshotV1`, byte limits, shell signatures |
| **Frontend tools** | `frontend-tools.ts` | `Tool.metadata.engenty`, `createFrontendToolDefinition` |
| **SSE** | `ag-ui-sse.ts` | `encodeAgUiSseEvent`, `parseAgUiSseChunk`, streaming parser |
| **Interrupts** | `engenty-open-interrupt.ts` | Session metadata for open decision / frontend-tool interrupts; `FrontendToolInterruptPayload` |
| **Input validation** | `validate-frontend-tool-input.ts` | Shared browser-tool input guards (e.g. `navigate`) |

Public exports are re-exported from `packages/ag-ui-bridge/src/index.ts`. After contract changes, run:

```bash
pnpm --filter @engenty/ag-ui-bridge test
pnpm --filter @engenty/ag-ui-bridge build
```

## Import convention

```ts
import {
  RunAgentInputSchema,
  EventType,
  createFrontendToolDefinition,
  toAgUiTool,
  encodeAgUiSseEvent,
  parseAgUiSseChunk,
  isAgentUiStateSnapshotV1,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
```

Prefer this package over importing `@ag-ui/core` directly in Engenty code so extension metadata and validators stay centralized.

**Do not** add React, module UI, or Mastra harness logic here.

## What this package owns vs neighbors

| Concern | Owner |
|---------|--------|
| Official AG-UI wire types and event schemas | `@engenty/ag-ui-bridge` (re-export) |
| Bounded UI state snapshot contract | `@engenty/ag-ui-bridge` |
| Frontend tool metadata on official `Tool` | `@engenty/ag-ui-bridge` |
| SSE encode/parse against official schemas | `@engenty/ag-ui-bridge` |
| Open interrupt session metadata | `@engenty/ag-ui-bridge` |
| Build `RunAgentInput` from live UI + transcript | `@engenty/ai-ui` (`buildAppsAiRunInput`) |
| AG-UI conversation reducer and transport | `@engenty/ai-ui` |
| Run harness, stream emission, tool execution | `apps/ai` |
| Prompt text from UI state, tenant tool gating | `@engenty/ai-core` |
| Collect route/shell/selection snapshots | `@engenty/app-shell` — [package docs](../app-shell/README) |

## Related docs

- [Architecture](./architecture) — neighborhood diagram and folder map
- [Compatibility](./compatibility) — protocol rules, upstream links, open gaps
- [Agent UI state](./agent-ui-state) — snapshot shape and size limits
- [Frontend tools](./frontend-tools) — metadata, native suspend/resume
- [AG-UI apps/ai session](../../ai-agents/ag-ui-apps-ai-session) — end-to-end product path
- [Agent UI runtime](../../agent-ui-runtime) — UI state and frontend-tool wiring
- [@engenty/ai-ui](../ai-ui/README) — browser AG-UI client
- [@engenty/ai-core](../ai-core/README) — server-side prompt and gating helpers
