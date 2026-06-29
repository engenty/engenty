---
title: Compatibility
description: AG-UI protocol rules, upstream sources, completed pass, and remaining gaps for @engenty/ag-ui-bridge.
---

# Compatibility

Engenty treats `@engenty/ag-ui-bridge` as the **compatibility gate** for AG-UI protocol work. Product chat on `apps/ai` is the reference implementation.

## Hard rule

Engenty may add product-specific state, tool metadata, tenant/module gating, and frontend execution helpers around AG-UI, but must **not** redefine AG-UI core shapes under Engenty-owned names when an official type, event, schema, or encoder exists.

Compatibility means:

- `RunAgentInput`, messages, tools, context, resume entries, state, and events match official `@ag-ui/core` schemas.
- Stream encoding uses `@ag-ui/encoder` (or proves byte-for-byte compatible output).
- Runtime validation calls official schemas first, then Engenty invariants (snapshot byte limits, tool metadata).
- Tests fail when local shapes drift from upstream AG-UI.

## Official sources (re-check before protocol changes)

- [AG-UI docs index](https://docs.ag-ui.com/llms.txt)
- [Core types](https://docs.ag-ui.com/sdk/js/core/types)
- [Event schemas](https://docs.ag-ui.com/sdk/js/core/events)
- [HttpAgent](https://docs.ag-ui.com/sdk/js/client/http-agent)
- [State model](https://docs.ag-ui.com/concepts/state)
- [Interrupts](https://docs.ag-ui.com/concepts/interrupts)
- [Upstream repo](https://github.com/ag-ui-protocol/ag-ui)

Published versions in repo today: `@ag-ui/core@0.0.53`, `@ag-ui/encoder@0.0.53` (patched). Re-check upstream before bumping pins.

## Completed pass (2026-05)

- Re-export official AG-UI contracts; validate inputs/events with upstream schemas in tests.
- `apps/ai` accepts official `RunAgentInput` and emits official AG-UI events.
- Copilot client path uses official run inputs and event reduction in `@engenty/ai-ui`.
- Frontend tools use official `Tool.parameters`; Engenty metadata under `Tool.metadata.engenty`.
- Browser tool execution uses official `TOOL_CALL_*` events plus Engenty's run-scoped HTTP result endpoint.
- Interrupt/resume uses `RunAgentInput.resume` and `RUN_FINISHED.outcome.type === "interrupt"`.
- Removed legacy pre-official unions (`EngentyAgentUiEvent`, `AgentUiRuntimeAdapter`, artifact payload types).

## Remaining gaps

| Gap | Owner |
|-----|--------|
| End-to-end `HttpAgent` proof against `apps/ai` run endpoint | `@engenty/ag-ui-bridge` tests + `apps/ai` |
| Generic Engenty UI client against non-Engenty AG-UI servers | Product decision; not started |
| Route/module context in agent prompts | `@engenty/ai-core` + `apps/ai` harness |
| Tool lifecycle UX polish | [CopilotKit alignment WIP](../../wip/ag-ui-copilotkit-alignment/index) |

## Acceptance tests (today)

`pnpm --filter @engenty/ag-ui-bridge test` covers:

- Official `RunAgentInputSchema` and resume entries
- Representative `AGUIEvent` branches including interrupt `RUN_FINISHED`
- Encoder round-trip via `encodeAgUiSseEvent` / `parseAgUiSseChunk`
- `HttpAgent` request-shape smoke (instantiation only)
- Frontend tool mapping to official `ToolSchema`
- Legacy frontend-tool definition rejection (`input_schema` shape)

Say **"AG-UI compatible"** in README or product copy only for paths covered by these tests. Call out unverified generic-client behavior separately.

## Active product work

Tool rows, HITL UX, and CopilotKit-shaped client polish live in [ag-ui-copilotkit-alignment](../../wip/ag-ui-copilotkit-alignment/index) — not duplicated here.

Cross-package milestones: [agentic-framework-tracker](../../../docs/dev/wip/agentic-framework-tracker.md) and [AG-UI apps/ai session](../../ai-agents/ag-ui-apps-ai-session).
