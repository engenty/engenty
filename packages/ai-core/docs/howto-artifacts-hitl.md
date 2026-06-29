---
title: HITL field suggestions
description: Field-suggestion review UI and future AG-UI integration points.
---

# HITL field suggestions

Legacy **`@ai-sdk-tools/artifacts`** streaming has been removed. Product chat runs on **AG-UI + Mastra** (`apps/ai`).

## Current UI

- **`HitlApprovalCard`** in `@engenty/ai-ui` (`components/copilot/interrupts/hitl-approval-card.tsx`) renders field suggestion review/apply chrome; embed via `@engenty/ai-ui/embed`.
- **`CopilotPanelContent`** accepts `latestSuggestions`, selection state, and apply handlers.
- Modules pass an empty list today until a new HITL feed lands (tool-row payload, open interrupt, or dedicated AG-UI state).

## Bounded-choice HITL (active)

Use **`requestDecision`** + **`resumeInterrupt`** (`RunAgentInput.resume`) for yes/no or multi-choice interrupts — not AI SDK artifact streams.

## Mastra tool publishing (dynamic agents)

For field-suggestion or artifact-style tools on **`apps/ai`**, stream through Mastra tool **`context.writer`** (see `requestDecision` and module dynamic capabilities). Do not use retired AI SDK artifact streams.

## Shared payload shape

`FieldSuggestion` Zod schemas live in `@engenty/ai-core` (`fieldSuggestionsPayloadSchema`) for future publish tools.
