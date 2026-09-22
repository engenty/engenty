---
title: "@engenty/ai-ui"
description: Agent and copilot UI for Engenty — AG-UI client runtime, thread management, admin surfaces, and chat chrome.
---

# @engenty/ai-ui

`@engenty/ai-ui` is the shared React layer for agent and copilot experiences in Engenty. Apps (`apps/ui`), modules (`modules/*/ui`), and the AI admin UI import from here for chat runtime, thread state, AG-UI session hooks, copilot presentation, and agent workspace pages.

Generic UI primitives (buttons, tables, shell layout) stay in `@engenty/ui-core`. Server orchestration, tools, and AG-UI endpoints stay in `@engenty/ai-core` and `apps/ai`.

**Copilot chrome and AI Elements live in this package** — not in ui-core. Product shell imports from `@engenty/ai-ui`; module embeds from `@engenty/ai-ui/embed`.

## Package layout

Source lives under `packages/ai-ui/src/`:

| Area | Path | Purpose |
|------|------|---------|
| **AG-UI client** | `ag-ui/` | Conversation reducer, SSE transport, `apps/ai` session hooks, tool-call merge, frontend-tool dispatch. |
| **Agent provider** | `agent-provider/` | `EngentyAI`, `EngentyAgent`, host registry (`useAgentHost`), affinity and lane binding. |
| **Copilot (product)** | `copilot/` | `CopilotRiverProvider` (the one thread per user), composer draft recovery, river path helpers. |
| **Threads** | `threads/` | Host-scoped thread lists, active-thread persistence (`engenty:threads:active`), Supabase realtime invalidation. |
| **Components** | `components/` | Copilot chrome (`copilot/`), AI Elements (`ai-elements/`), dev AG-UI inspector. |
| **Features** | `features/` | Admin agents workspace, AI settings, dynamic registry editors. |
| **Routes** | `routes/` | Full-page admin routes registered via the UI plugin. |
| **Lib — runtime** | `lib/runtime/` | Shared `apps/ai` fetch client (`ai-service-client`), registry, runs, and sessions HTTP. |
| **Lib — admin** | `lib/admin/` | `apps/core` admin HTTP (`/api/*`), TanStack Query keys, and admin catalog/settings clients. |

Public exports are re-exported from `packages/ai-ui/src/index.ts` with Tier 1/2 comments at the top of the barrel. **Tier 1 embed API** also ships as a dedicated subpath: `@engenty/ai-ui/embed` (see [Import convention](#import-convention)). The UI plugin entry is `@engenty/ai-ui/plugin` (admin only — embed API does not need the manifest).

## Public API tiers

| Tier | Audience | Examples |
|------|----------|----------|
| **Tier 1 — embed** | Modules, chatbot embeds, KB lanes | `EngentyAI`, `EngentyAgent`, `useAgentHost`, `useEngentyThreads`, `useEngentyFrontendTool`, `CopilotTranscript`, `Message`, `registerToolCallUi` |
| **Tier 2 — product copilot** | Main `engenty:copilot` shell and the river page | `CopilotRiverProvider`, `useCopilotRiver`, `CopilotDrawerInjectedSession` |
| **Admin plugin** | Operator UI via UI catalog | `@engenty/ai-ui/plugin`, `routes/`, `features/`, `lib/admin/*` |

See [Architecture](./architecture) for integrator inputs (`hostKey`, `agentTypeKey`, `serviceBaseUrl`) and neighborhood boundaries.

## Import convention

**Module embeds and standalone React apps** should import Tier 1 from the embed subpath so bundlers do not pull admin routes or product copilot shell hooks:

```tsx
import {
  EngentyAI,
  EngentyAgent,
  useEngentyThreads,
  useEngentyAgUiConversation,
  CopilotTranscript,
  Message,
  PromptInput,
} from "@engenty/ai-ui/embed";
```

**Product shell and admin UI** import from the main entry (Tier 1 + Tier 2 + admin):

```tsx
import {
  EngentyAI,
  EngentyAgent,
  CopilotRiverProvider,
  useEngentyThreads,
  useEngentyAgUiConversation,
  CopilotTranscript,
  Message,
  PromptInput,
} from "@engenty/ai-ui";
```

Use `@engenty/ui-core` for generic primitives. Use `@engenty/ai-ui` for anything that talks to agent sessions, copilot hosts, AG-UI streams, transcript chrome, or admin AI routes. Module embeds should use **Tier 1** hooks only — prefer `@engenty/ai-ui/embed` for embed surfaces.

**Do not** import copilot or AI Elements from `@engenty/ui-core`. **`ui-core` must not import `ai-ui`** (Turbo build cycle).

## UI plugin

Admin routes and i18n register through `@engenty/ai-ui/plugin` (agents workspace, skills catalog, AI settings). Module copilot surfaces mount `EngentyAgent` in module UI — not in `apps/ui` — with a module-specific `hostKey`.

## Related docs

- [Architecture](./architecture) — boundaries, lib split, embed API, drawer contract
- [Copilot UI](./copilot) — drawer, panel, composer, transcript
- [AI Elements](./ai-elements) — message and prompt primitives
- [Skills Catalog](./skills-catalog) — admin UI and hooks for the two-tier skill catalog
- [Agent UI runtime](../../agent-ui-runtime)
- [AG-UI session contract](../../ai-agents/ag-ui-apps-ai-session)
- [@engenty/ui-core](../ui-core/README)
- [@engenty/app-shell](../app-shell/README) — layout frame and Agent UI registration
- [@engenty/ag-ui-bridge](../ag-ui-bridge/README) — official AG-UI wire contracts
- [@engenty/ai-core](../ai-core/README)
