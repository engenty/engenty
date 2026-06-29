---
title: Copilot UI
description: Presentation components for copilot drawer, panel, composer, transcript, and interrupts.
---

# Copilot UI

`components/copilot/` holds **presentation** for Engenty copilot surfaces: drawer and panel chrome, composer, transcript, tool-call rows, session layout persistence, and HITL/interrupt cards.

Runtime wiring (AG-UI session harness, thread binding, host registry) lives in `@engenty/ai-ui` (`ag-ui/`, `agent-provider/`, `threads/`, `copilot/` hooks) and `modules/engenty-copilot`. These components accept props and callbacks — they do not own the agent loop.

**Package boundary:** owned by `@engenty/ai-ui`. Import generic primitives from `@engenty/ui-core` only inside this tree. Apps and modules import copilot UI from `@engenty/ai-ui` (product shell) or `@engenty/ai-ui/embed` (module embeds / standalone React apps).

## Folder map

| Path | Responsibility |
|------|----------------|
| `drawer/` | `CopilotDrawer`, dock modes, `CopilotDrawerInjectedSession` |
| `panel/` | `CopilotPanelContent`, `CopilotPanelHeader`, docked panel scroll |
| `composer/` | `CopilotComposer`, agent picker, compact launcher, mention popover |
| `composer/agent-status-ticker/` | `AgentStatusTicker`, `deriveAgentStatusTicker` — status line behind composer |
| `transcript/` | `CopilotTranscript`, message parts, loading skeleton |
| `tool-call/` | `ToolCallCard`, registry, default cards |
| `interrupts/` | Decision artifacts, frontend-tool confirm, HITL approval, open-interrupt banner |
| `session/` | Layout snapshot types, client storage helpers, suggestions state |

## Key exports

```tsx
import {
  CopilotDrawer,
  type CopilotDrawerInjectedSession,
  CopilotPanelContent,
  CopilotComposer,
  CopilotTranscript,
  ToolCallCard,
  registerToolCallUi,
  AgentStatusTicker,
  DecisionArtifactCard,
  FrontendToolConfirmCard,
} from "@engenty/ai-ui";
```

## Drawer injected session

`CopilotDrawer` receives an optional `injectedSession` built by the app shell — it does not fetch threads or own persistence.

| Field | Role |
|-------|------|
| `activeThreadId` | Current thread id for the drawer lane |
| `setActiveThreadId` | Select or clear the active thread |
| `clearDrawerComposerState` | Clear composer draft and local UI state only — does not delete the server thread |
| `messages`, `status`, `submitMessage`, `cancelRun` | Lane state from `useAgentHost` |

`apps/ui/src/components/copilot-drawer-layer.tsx` maps `useAgentHost(ENGENTY_COPILOT_HOST_KEY)` + `useCopilotThreadBinding` + `useCopilotThreadActions` onto this shape.

Orchestrator-era names (`controlledFloatingChatSession`, `storeId`, `useCopilotAgentSelection`) are retired — use `activeThreadId` and host-scoped threads (`useEngentyThreads`).

## Composer status flap

`CopilotCompactComposerShell` (used by drawer, floating, bottom, and full-page compact paths) renders run status **behind** the composer card — not inside the textarea. `AgentStatusTicker` with `statusOnly` keeps assistant prose in the transcript only.

| Topic | Detail |
|-------|--------|
| **Source** | `composer/agent-status-ticker/` + `composer/copilot-compact-composer-shell.tsx` |
| **ui-core** | Must not import `@engenty/ai-ui` (Turbo cycle) |
| **Message shape** | `AgentTurnMessageLike` from `@engenty/ag-ui-bridge` |

## Session and layout persistence

- `COPILOT_LAYOUT_USER_SETTING_NAME`, `CopilotLayoutSnapshotV1` — persisted dock/slot preferences
- `clearCopilotPersistedClientStorage` — bulk reset helper (used when clearing all chats)
- Active thread per host: `readActiveThreadIdForHost` / `writeActiveThreadIdForHost` (`engenty:threads:active`)

Product chat identity and thread lists are owned by `@engenty/ai-ui` hooks (`useAgentHost`, `useEngentyThreads`, `ActiveCopilotProvider`). Shell layout persistence types live in `@engenty/app-shell`.

## Tool-call timeline (ChainOfThought)

`CopilotMessageContent` (`transcript/copilot-message-content.tsx`) groups an assistant turn's **tool** parts into a collapsible [`ChainOfThought`](../ai-elements/#components) timeline rendered *above* the assistant text. It opens while the run streams ("Working…") and auto-collapses when done ("Used N tools").

This is the **chain of tool calls** — distinct from the **chain of thoughts** (model reasoning text), which is a parked server vertical that emits no `REASONING_*` events. Reasoning parts are deliberately excluded from the timeline so the header count stays tool-accurate. See `docs/content/wip/roadmap/enhancing-copilot/` (`index.md` Ch.2 + `reasoning-vertical.md`).

### Step renderers

Per-tool steps live in `transcript/chain-of-thought-steps.tsx`:

| Renderer | Used for | Shows |
|----------|----------|-------|
| `WebSearchStep` | tools whose resolved name contains `web_search` | label `Search: <query>`, result-count description, host/title chips, any images |
| `GenericToolStep` | every other tool | resolved label, secondary scope/path descriptor, images + a prose snippet |

Each completed step's expanded body is built by `resolveStepContent(part)`:

- **Error detection first** — `detectToolOutputError` (`tool-call/tool-call-card-utils.ts`) recognises an output that *looks* successful (output present → `getToolState` = completed) but actually carries a failure: a Zod issue array, `{errors|issues: […]}`, `{ok:false}`, or `{error: "…"}`. When found, the step flips to **error** status (red ✕) and shows the message instead of a misleading green check.
- **Images** — `collectToolImages` walks the output for image URLs / data-URIs / `{url, caption}` records, rendered via `ChainOfThoughtImage`.
- **Prose snippet** — `extractProseSnippet` surfaces *only* a real sentence from a `summary`/`message`/`text`/… field (requires whitespace, so bare IDs are skipped). ID dumps and stringified JSON are **never** shown here — the full structured input/output stays in the expandable `ToolCallCard`.

Streaming (still-running) steps suppress the body and show only the shimmer label.

### Extending

- New per-tool body shape (custom chips, structured fields): branch in `chain-of-thought-steps.tsx`, or drive it off the [tool-call registry](./tool-call-registry) for module-owned tools.
- New error payload shape: extend `detectToolOutputError`.
- New prose source field: add to `PROSE_OUTPUT_KEYS`.

Unit tests: `tool-call/__tests__`-adjacent `tool-call-card-utils.test.ts` (helpers) and `transcript/copilot-message-content.test.tsx` (render + expand behavior).

## Custom tool-call rows

Modules register transcript tool UI with `registerToolCallUi` in the module `ui/plugin.ts` default export. See [Tool-call registry](./tool-call-registry).

## Related docs

- [AI Agents — AG-UI session](../../ai-agents/ag-ui-apps-ai-session) — product copilot architecture and `apps/ai` runs
- [AG-UI session harness](../../ai-agents/ag-ui-apps-ai-session) — `apps/ai` runs and message authority
- [Architecture](../architecture) — Tier 1 vs Tier 2 API boundaries

## Source

`packages/ai-ui/src/components/copilot/`
