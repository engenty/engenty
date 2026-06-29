# `/module/engenty-copilot/chat/new` flow — debug reference

**Status:** updated 2026-05-29 — Active Copilot v1 (`ActiveCopilotProvider` + `CopilotThreadBindingProvider`). Pre-2026-05-26 `useAgentChatController` / `AgentChatProvider` stack was removed — see [active-copilot-v1-decision.md](./active-copilot-v1-decision.md).

## Intended product contract

1. User stays on `/module/engenty-copilot/chat/new` until the first message creates an `ai.agent_session`.
2. URL updates to `/module/engenty-copilot/chat/:threadId` **only when submit status is idle** (`ready`, not `submitted` / `streaming`).
3. Server transcript (`MESSAGES_SNAPSHOT` + TanStack messages query) is authoritative after idle; in-run UI uses `pendingSend` only for the optimistic user bubble.
4. Global copilot drawer does not mount on full-page chat routes.

See also: [ag-ui-apps-ai-session.md](../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md), [agent-context-index.md](../../../docs/dev/agent-context-index.md).

---

## Architecture (current)

| Layer | Path | Role |
| --- | --- | --- |
| App shell mount | `apps/ui/src/copilot/app-active-copilot-provider.tsx` | Wraps `AppLayout` with `ActiveCopilotProvider` + route props |
| Thread binding | `packages/ai-ui/src/copilot/copilot-thread-binding-provider.tsx` | URL ↔ `activeThreadId`, new-chat generation, deferred navigate on first create |
| Lane | `packages/ai-ui/src/copilot/active-copilot-provider.tsx` | `EngentyAgent` for `engenty:copilot` with hydration + thread query keys |
| Session engine | `packages/ai-ui/src/ag-ui/apps-ai/use-engenty-ag-ui-apps-ai-session.ts` | SSE, `pendingSend`, `MESSAGES_SNAPSHOT`, `onThreadCreated` |
| Full-page view | `modules/engenty-copilot/ui/pages/chat-page.tsx` | Dumb view: `useCopilotSelectedThread()` + `ChatPanel` — no local session controller |
| Routes | `modules/engenty-copilot/ui/paths.ts`, `ui/lib/chat/resolve-copilot-chat-route.ts` | `COPILOT_CHAT_NEW`, `parseCopilotChatPathname`, entry redirect |

---

## Step-by-step

### A. Route registration and URL parsing

1. **Module routes** — `modules/engenty-copilot/ui/plugin.ts`:
   - `/module/engenty-copilot` and `/module/engenty-copilot/chat` → root redirect → `COPILOT_CHAT_NEW`.
   - `/module/engenty-copilot/chat/:threadId` → `CopilotChatPage`.

2. **Path helpers** — `paths.ts`:
   - `COPILOT_CHAT_NEW` = `/module/engenty-copilot/chat/new`.
   - `parseCopilotChatPathname`: `new` → `{ kind: "new" }`; valid UUID → `{ kind: "session", threadId }`.

3. **Shell** — `apps/ui/src/components/copilot-provider-content.tsx`:
   - Full-page copilot chat routes skip drawer mount.

### B. `/new` create flow

1. `CopilotThreadBindingProvider` sets `activeThreadId = null` on `/new`.
2. User submits → `EngentyAgent` → `useEngentyAgUiAppsAiSession.submitMessage`.
3. First send creates server session → `onThreadCreated` → binding queues URL navigate when `status === "ready"`.
4. After navigate, `useCopilotInitialMessages` hydrates from TanStack query; `suppressHydration` during active runs.

### C. Full-page page wiring

1. `chat-page.tsx` reads `useCopilotSelectedThread()` for binding + host lane state.
2. Renders `ChatPanel` keyed by `host.threadResetKey`.
3. Dev-only `logCopilotChatPanel("render", …)` in `useEffect` (module-local helper).

---

## Dev logging (`[copilot:chat-new]`)

Guard: `isEngentyDevelopmentEnvironment()` only.

**Not public API:** `logCopilotChatNew` / `logCopilotChatPanel` are **not** exported from `@engenty/ai-ui` or `@engenty/ai-ui/embed`. They live in `packages/ai-ui/src/ag-ui/chat-new-debug.ts` (internal). Module panel logging uses `modules/engenty-copilot/ui/dev/chat-panel-debug.ts`.

| Event | File |
| --- | --- |
| `active binding` | `copilot-thread-binding-provider.tsx` |
| `active messages hydrate` / `active provider onThreadCreated` | `active-copilot-provider.tsx` |
| `session hook state`, `submitMessage`, `pendingSend`, `MESSAGES_SNAPSHOT`, `resetConversation` | `use-engenty-ag-ui-apps-ai-session.ts` |
| `hydrate skipped` / `hydrate dispatch` | `conversation.ts` |
| `panel:render` | `chat-page.tsx` via `logCopilotChatPanel` |
| `CopilotProviderContent skip drawer` | `copilot-provider-content.tsx` |

Filter console: `[copilot:chat-new]` (panel lines use `panel:` prefix).

---

## Historical bugs (fixed — keep for regression context)

1. **Navigate on create (too early)** — URL updated while still `streaming`. **Fix:** queue navigate until `status === "ready"`.
2. **Empty hydrate after URL bind** — `initialMessages: []` while query loading replaced in-memory transcript. **Fix:** pass `undefined` until first fetch completes.
3. **Duplicate user bubble** — pending-send merged into `messages[]` while snapshot already had the row. **Fix:** render pending outside canonical `messages[]`.
4. **Lane context stale after hydrate** — same object reference on `EngentyAgent` context. **Fix:** memoized lane value with new reference when messages change.
5. **Session id ping-pong** — multiple writers for `threadId`. **Fix:** URL-authoritative binding; `/new` keeps prop `null` until idle navigate.

Manual regression rows: [manual-e2e-matrix.md](./manual-e2e-matrix.md) (rows 5, A1-navigate, A1-reload).

---

## What to watch in logs (failure modes)

| Symptom | Likely log pattern |
| --- | --- |
| Bounce to `/new` mid-run | `resetConversation` after `threadId` cleared; invalid URL segment redirect |
| Empty transcript after first reply | `hydrate dispatch` with `incomingCount: 0` after reset |
| Duplicate user bubble | `pendingSend set` still visible after `MESSAGES_SNAPSHOT` with same user text |
| Drawer + full-page double session | missing drawer skip on `/module/engenty-copilot/chat/*` |
