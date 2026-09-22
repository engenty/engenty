---
title: Architecture
description: Package boundaries, runtime vs admin split, public embed API, and ui-core neighborhood for @engenty/ai-ui.
---

# Architecture

`@engenty/ai-ui` is the **browser-side agent runtime** for Engenty: AG-UI client state, host-scoped threads, copilot orchestration hooks, copilot/AI Elements presentation, and first-party **admin AI** pages. It is not a backend package — no server plugin, no Hono routes, no DB.

## Neighborhood

| Package / app | Role |
|---------------|------|
| **`apps/ai`** | HTTP + SSE: `/ai/threads`, `/ai/v1/runs`, `/ai/registry/*`, AG-UI stream |
| **`packages/ai-core`** | Registration contracts, Mastra tool builders, AG-UI message helpers, agent UI prompt context, usage/model config (`browser` entry for client-safe imports) |
| **`packages/ag-ui-bridge`** | Official AG-UI wire types, SSE helpers, interrupt metadata — [package docs](../ag-ui-bridge/README) |
| **`packages/ui-core`** | Generic UI only (`ui/`, `admin/`, `layout/`) — **no** copilot or AI Elements |
| **`packages/app-shell`** | Shell frame, state snapshot, frontend-tool registration (`useFrontendTool`), copilot layout constants — [package docs](../app-shell/README) |
| **`packages/ai-ui`** | React runtime + admin UI (this package) |
| **`apps/ui`** | App bootstrap: auth, layout, mounts `EngentyAI` + drawer glue |
| **`modules/*`** | Embed `EngentyAgent` with module-specific `hostKey` |

```text
apps/ui ──mounts──► EngentyAI (ai-ui)
                         │
modules/* ──embed──► EngentyAgent (ai-ui)
                         │
                         ▼ fetch / SSE
                    apps/ai (/ai/*)
                         │
                         ▼ tools / auth
                    apps/core (/api/*)
```

## ui-core boundary

`@engenty/ai-ui` owns **copilot chrome** (`src/components/copilot/`) and **AI Elements** (`src/components/ai-elements/`). `@engenty/ui-core` keeps only `ui/`, `admin/`, and `layout/`.

| Rule | Detail |
|------|--------|
| Import copilot/chat from | `@engenty/ai-ui` only |
| Import buttons, tables, shell from | `@engenty/ui-core` |
| ui-core → ai-ui | **Forbidden** (Turbo cycle) |
| Shell layout without ai-ui | `COPILOT_BOTTOM_DOCK_HEIGHT`, layout persistence API in `@engenty/app-shell` |

Details: [agent-ui-runtime.md](../../agent-ui-runtime).

## Two layers inside ai-ui

One package mixes **framework runtime** and **product admin**. Consumers pick the tier that matches their integration.

| Layer | Paths | Consumers | Plugin manifest? |
|-------|-------|-----------|------------------|
| **Runtime (embed API)** | `ag-ui/`, `agent-provider/`, `threads/`, `components/` | Modules, embeds, `apps/ui` shell | **No** — npm imports only |
| **Product copilot** | `copilot/` | Main `engenty:copilot` lane, `modules/engenty-copilot` | No |
| **Admin (operator UI)** | `routes/`, `features/`, `lib/admin/`, `plugin.tsx`, `locales/` | `apps/ui` via UI plugin catalog | **Yes** — `engenty.plugin.json` |

## Folder map

| Path | Tier | Notes |
|------|------|-------|
| `ag-ui/` | Runtime | Conversation reducer, `apps/ai` transport, tool-call merge, frontend-tool handlers (native suspend/resume) |
| `agent-provider/` | Runtime | `EngentyAI`, `EngentyAgent`, `useAgentHost` |
| `threads/` | Runtime | `useEngentyThreads` — CopilotKit-shaped thread list; active id map `engenty:threads:active` |
| `components/copilot/` | Runtime | Drawer, panel, composer, transcript, tool-call registry, interrupts |
| `components/ai-elements/` | Runtime | `Message`, `PromptInput`, `Shimmer` |
| `copilot/` | Product | `CopilotRiverProvider`, river paths — main copilot shell only |
| `features/` | Admin | Agents workspace, AI settings editors |
| `routes/` | Admin | React Router pages under `/admin/ai/…` |
| `lib/runtime/` | Runtime + admin | Shared `apps/ai` HTTP (`ai-service-client`, registry, runs, sessions) |
| `lib/admin/` | Admin | `apps/core` `/api/*` clients, TanStack Query keys, catalog/settings/triggers |
| `locales/` | Admin | `ai-ui` i18n namespace |

`ag-ui/apps-ai/` holds the primary AG-UI session transport and TanStack query keys for threads/runs. `lib/runtime/` is the lower-level fetch layer those clients and admin re-exports build on.

## Public embed API (Tier 1)

Import from `@engenty/ai-ui/embed` for module embeds and standalone React apps. The main `@engenty/ai-ui` entry re-exports the same Tier 1 surface plus Tier 2 product copilot and admin exports.

Role model: **small hooks + one provider + `hostKey` scoping** (CopilotKit-shaped lifecycle, not CopilotKit React).

| API | Purpose |
|-----|---------|
| `EngentyAI` | Root provider: `serviceBaseUrl`, tenant, frontend tools, thread transport |
| `EngentyAgent` | One lane: submit, stream, transcript for a `hostKey` |
| `useAgentHost(hostKey)` | Read lane state |
| `useEngentyThreads(hostKey)` | List, active thread, rename, delete, clear |
| `useEngentyThread(hostKey, threadId)` | Single thread detail |
| `useEngentyFrontendTool` | Register a browser handler for a native frontend tool (suspend/resume) |
| `resolveEngentyAiServiceBaseUrl` | Gateway origin for embeds |
| `buildAppsAiRunInput` / `buildAppsAiResumeRunInput` | Advanced run payload construction |
| Presentation | `CopilotTranscript`, `CopilotPanelContent`, `Message`, `ToolCallCard`, `registerToolCallUi` |

Required integrator inputs:

```text
hostKey         engenty:copilot | chatbot:<id> | kb:search | {module}:action:…
agentTypeKey    registry agent id (distinct from hostKey)
serviceBaseUrl  gateway origin (VITE_ENGENTY_AI_BASE_URL)
routeContext    bounded AG-UI context — not fat scope blobs
```

Active thread persistence is **per `hostKey`** via `readActiveThreadIdForHost` / `writeActiveThreadIdForHost` (`engenty:threads:active` localStorage map). Legacy `engenty:copilot:last-active-thread` and orchestrator-era session bridges are removed.

## Product copilot (Tier 2)

Main copilot shell wiring — not for generic module embeds:

| API | Purpose |
|-----|---------|
| `CopilotRiverProvider` | Opens the user's one copilot thread (the river) and mounts the `engenty:copilot` host on it |
| `useCopilotRiver` | The river's id, pathname and navigate, for every copilot surface |
| `CopilotDesk` | The copilot's page: the river drawn with the specialist desk's frame (`DeskFrame`) |
| `active-copilot-controller.ts` | Pure session rules, last-active persistence, new-chat generation |

`apps/ui/src/copilot/app-active-copilot-provider.tsx` mounts the provider above `AppLayout`. Full-page chat lives in `modules/engenty-copilot`.

### Drawer injected session

`CopilotDrawer` does not own a thread. The host supplies a `CopilotDrawerInjectedSession` built from `useAgentHost` + `useCopilotRiver`:

| Field | Role |
|-------|------|
| `activeThreadId` | Current thread for the drawer lane |
| `setActiveThreadId` | Select or clear active thread |
| `clearDrawerComposerState` | Reset composer chrome only — not server thread delete |
| `submitMessage`, `cancelRun`, `resumeInterrupt`, … | Lane run lifecycle from `useAgentHost` |

Retired drawer/session names: `controlledFloatingChatSession`, `storeId`, `useCopilotAgentSelection`, `performFullSessionReset`, orchestrator-era `sessionId` field names on the injected session object.

## App-shell helpers (Tier 3)

`useFrontendTool`, `useAgentUiStateSnapshot` — `ai-ui` wraps these; modules should prefer `useEngentyFrontendTool`.

## HTTP clients (not backend)

Browser fetch only — no server routes in this package.

| Path | Backend | Purpose |
|------|---------|---------|
| `ag-ui/apps-ai/*` | `apps/ai` | Threads, runs, AG-UI SSE, interrupt resume (`resume[]` on a new run) |
| `lib/runtime/*` | `apps/ai` | Shared AI service client, registry, runs, sessions |
| `lib/admin/*` | `apps/core` `/api/*` | Admin catalog, settings, triggers, instruction config (shrinking as routes move to `apps/ai`) |

Admin **pages** stay in ai-ui; admin **HTTP** consolidates under `apps/ai` over time. Legacy stub modules (`removed-sessions-api`, `removed-core-ai-paths`) are deleted — callers use `lib/runtime/` and `ag-ui/apps-ai/` directly.

## `engenty.plugin.json`

Required for **admin UI plugin discovery** (`pnpm --filter @engenty/ui generate:plugins` → catalog + Tailwind `@source`). Entry: `@engenty/ai-ui/plugin` from `src/plugin.tsx`.

- **Not** a backend module manifest — core does not load a server entry for ai-ui.
- **Not** needed for Tier 1 embed imports — use `@engenty/ai-ui/embed` instead of the main barrel when bundling embed-only surfaces.

## Related docs

- [Overview](./README)
- [Copilot UI](./copilot)
- [AI Elements](./ai-elements)
- [Agent UI runtime](../../agent-ui-runtime)
- [AG-UI session contract](../../ai-agents/ag-ui-apps-ai-session)
- [@engenty/ui-core](../ui-core/README)
- [@engenty/ai-core](../ai-core/README)
