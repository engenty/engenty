# EngentyAI — global agent provider goal

**Essence:** **`EngentyAI`** at the app shell owns shared **`apps/ai`** infrastructure (auth, transport, frontend-tool registry, TanStack query keys, and an internal **session registry** keyed by `hostKey`). **Only the main product copilot is global** — `ActiveCopilotProvider` / `engenty:copilot` in `apps/ui`, wrapping drawer + floating + bottom + full-page chat.

**Module features own their own agent UI.** Knowledge Base hub chat, Contacts “Enhance”, Chatbot playground, etc. mount **`EngentyAgent` inside their module routes/layouts** (`modules/knowledge-base`, `modules/contacts`, …). **`apps/ui` and `apps/core` must not import module pages or mount module agents.**

`hostKey` is a **registry handle** inside `EngentyAI` so multiple `EngentyAgent` trees under the same provider do not clobber each other. It is **not** a product concept of “lanes at app root”.

**`apps/ai` stays master** for runs, persistence, interrupts, and Mastra assembly.

**Prerequisite (verify before Phase 1 sign-off):** Copilot Track B message authority is **done** ([../GOAL.md](../GOAL.md)). Manual E2E for `/new` → first snapshot is still **open** ([../manual-e2e-matrix.md](../manual-e2e-matrix.md)).

---

## Target shape (what actually ships)

### App shell (`apps/ui`) — global copilot only

```tsx
<EngentyAI serviceBaseUrl={...} tenantId={...} queryClient={...}>
  <CopilotShellProvider>
    <AppActiveCopilotProvider tenantId={...} userId={...}>
      <AppLayout>
        <AuthenticatedRoutes />   {/* module routes render inside */}
      </AppLayout>
      <CopilotShellUiHost />      {/* drawer portals into shell anchors */}
    </AppActiveCopilotProvider>
  </CopilotShellProvider>
</EngentyAI>
```

Consumers: **`useCopilotThreadBinding`**, **`useEngentyThreads`**, **`useAgentHost`**, **`useCopilotThreadActions`** — no `useActiveCopilot` facade. No second global agent.

### Inside a module route — module-owned `EngentyAgent`

Example: KB hub chat (`modules/knowledge-base/ui/pages/kb-hub-chat-page.tsx`):

```tsx
export function KbHubChatPage() {
  return (
    <EngentyAgent
      hostKey="kb:search"
      agentId="knowledge-base.manager"
      routeContext={{ moduleId: "knowledge-base", pathname, routeKey: "chat" }}
      threadId={null}
    >
      <KbHubChatPageContent />
    </EngentyAgent>
  );
}
```

Example: Contacts enhance (`modules/contacts/ui/components/enhance-contact-panel.tsx`):

```tsx
<EngentyAgent
  hostKey={`contacts:action:enhance:${contact.id}`}
  agentId="contacts.manager"
  stableSessionKey={...}
  routeContext={{ moduleId: "contacts", routeKey: "enhance", scope: { entityId } }}
  threadId={null}
>
  <EnhanceContactPanelBody />
</EngentyAgent>
```

**Rule:** `EngentyAgent` wraps **module UI only**. Register the route in the module’s `ui/plugin.ts`; never add KB/Contacts/Chatbot `EngentyAgent` siblings next to `AppLayout` in `apps/ui`.

Implementation plan: [README.md](./README.md). Mount rules and verification: this file.

---

## Feasibility verdict

| Scope | Verdict | Notes |
|-------|---------|--------|
| **`EngentyAI` + global active copilot** | **Done** | `ActiveCopilotProvider` + granular hooks; one `engenty:copilot` host. |
| **Module-local `EngentyAgent`** (KB, action panels, chatbot) | **Done pattern** | Already in module packages; registry via `hostKey` only. |
| **Session registry** (`hostKey` → lane state) | **Feasible** | Supports parallel module agents + global copilot without shared reducer bleed. |
| **Sub-agents** | **Backend** | One parent `threadId` per `EngentyAgent` tree unless we add sub-run UI. |
| **AG-UI + HITL** | **Sufficient today** | Official events + `resumeInterrupt`; see [ag-ui-apps-ai-session.md](../../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md). |

---

## Grounding — what exists today (2026-05)

| Layer | Today | Role |
|-------|--------|------|
| App shell | `EngentyAI` → `AppActiveCopilotProvider` → granular hooks | **Only** global copilot |
| KB hub | `modules/knowledge-base/.../kb-hub-chat-page.tsx` | `EngentyAgent` `kb:search` **in module** |
| Contacts enhance | `modules/contacts/.../enhance-contact-panel.tsx` | `EngentyAgent` `contacts:action:…` **in module** |
| Chatbot | `modules/chatbot/...` | Own `EngentyAgent` per widget/playground |
| HTTP / persistence | `apps/ai` | Master runtime |

---

## Responsibilities

### `EngentyAI` (app root — `@engenty/ai-ui`)

- Auth, `VITE_ENGENTY_AI_BASE_URL`, frontend-tool catalog, query keys
- **Registry:** `registerHost` / `resolveHost(hostKey)` for every `EngentyAgent` mounted anywhere under the tree
- **Not** module routes, copilot chrome, or KB/Contacts UI

### `ActiveCopilotProvider` (global copilot only)

- `hostKey: "engenty:copilot"`, `agentId: "engenty.copilot"`
- `activeThreadId` (binding), session list, drawer + full-page surfaces
- **Must not** host KB or module action agents

### `EngentyAgent` (module or copilot boundary)

- Mount **in the module** (or inside `ActiveCopilotProvider` for copilot only)
- `agentId`, `threadId` | `stableSessionKey`, `routeContext`
- Registers with `EngentyAI` under `hostKey`; siblings use `useAgentHost(hostKey)` or `useAgentHostConfig`

### `apps/ai` (master backend)

- Unchanged: `ai.agent_session*`, runs, snapshots, interrupts

---

## Where agents live (not “lanes at app root”)

| Surface | Where `EngentyAgent` mounts | `hostKey` (registry) |
|---------|------------------------------|-------------------------|
| Main copilot (drawer, floating, bottom, full-page) | **`apps/ui`** via `ActiveCopilotProvider` | `engenty:copilot` |
| KB hub search/talk | **`modules/knowledge-base`** `KbHubChatPage` | `kb:search` |
| Contacts → Enhance | **`modules/contacts`** `EnhanceContactPanel` | `contacts:action:enhance:{id}` |
| Chatbot embed / playground | **`modules/chatbot`** | `chatbot:{id}` (not `engenty:copilot`) |
| Task run observer (future) | **`modules/tasks`** (observe-only UI) | `task:run:{runId}` |

**Default rule:** one global copilot conversation per user; module agents are **opt-in, page-local**, and must not mutate `engenty:copilot`.

---

## Capabilities matrix

| Capability | AG-UI / Engenty | Provider note |
|------------|-----------------|---------------|
| Streaming chat | Official events + `MESSAGES_SNAPSHOT` | One authority per `hostKey` |
| Agent UI state | `RunAgentInput.state` | From app-shell snapshot on each run |
| HITL | `resumeInterrupt` + open interrupt metadata | No synthetic user rows |
| Frontend tools | Official `TOOL_CALL_*` | Registry via app-shell |
| Sub-agents | Server delegation | Parent session per `EngentyAgent` tree |

---

## Phased outcomes (corrected)

### Phase 2 — copilot surface hard cutover

| Outcome | Detail |
|---------|--------|
| Global copilot only in `apps/ui` | `AppActiveCopilotProvider` above layout; drawer host beside routes |
| **Do not** mount KB/action `EngentyAgent` in `apps/ui` | KB/Contacts already own `EngentyAgent` in module files |
| Shell may import **route helpers only** (e.g. `isKbHubChatRoute` to close drawer) | No module agent UI in core |

### Phase 3 — session registry (not “multi-lane app layout”)

| Outcome | Detail |
|---------|--------|
| `hostKey` registry in `EngentyAI` | Copilot + any module `EngentyAgent` under the same provider tree |
| Module agents stay in modules | Registry allows parallel bindings without mounting modules in core |
| Inactive bindings | No hydrate over active SSE; respect URL-owned copilot `threadId` |

---

## Non-goals

- Mounting KB, Contacts, or other module `EngentyAgent` trees in `apps/ui` / `AppLayout`
- Importing `modules/*` into `apps/core` or `apps/ai` frontend-tool catalog
- CopilotKit `CopilotRuntime` replacing `apps/ai`
- Client transcript dedupe / merge heuristics

---

## References

- [AG-UI apps/ai session](../../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md)
- [Active copilot v1](../active-copilot-v1-decision.md)
- [Copilot module track](../GOAL.md)
- [Implementation plan](./README.md) · [RFC](./RFC.md)
