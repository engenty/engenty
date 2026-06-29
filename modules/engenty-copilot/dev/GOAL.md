# Copilot chat — architecture goal

## Status (2026-05)

| Track | Phases | Status |
|-------|--------|--------|
| **A — Hook unification** | 1–4 | **Done** (transport, drawer/KB, interrupts) |
| **B — Message authority** | 5–7 | **Done** — snapshot replace, pending send UI, single hydrator |
| **B — Shell stability** | **7b** | **Done** — no max update depth on shell surfaces |
| **C — Local recovery** | 8 | **Partial** — composer draft `localStorage` v1 (env-gated); in-flight run buffer deferred |
| **D — CopilotKit-shaped client** | — | **Active (WIP)** — one tool status, frontend-tool single flight, collapsed widgets; optional CopilotKit React v2 bridge later |

Track A removed the module fork (`use-chat-submit`, `useCopilotSession`, copilot naming). Track B fixes the **data model** we left broken: two authorities for the same transcript (optimistic `Message[]` + query hydrate + text dedupe).

**Canonical product doc:** [docs/content/dev/ai-agents/ag-ui-apps-ai-session.md](../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md)  
**Track D (client polish / CopilotKit-shaped):** [docs/content/wip/ag-ui-copilotkit-alignment/index.md](../../../docs/content/wip/ag-ui-copilotkit-alignment/index.md)  
**Official AG-UI:** [Messages](https://docs.ag-ui.com/concepts/messages), [Events (MessagesSnapshot)](https://docs.ag-ui.com/concepts/events)  
**Historical migration note:** [docs/dev/ag-ui-ui-messages-migration.md](../../../docs/dev/ag-ui-ui-messages-migration.md) (complete — pointer only; no AI SDK stream compatibility)

---

## Why Track B exists

Phases 1–4 delivered **one hook** (`useEngentyAgUiAppsAiSession`) but kept **two transcript writers**:

1. Client optimistic `appendUserMessage` (client-generated `Message.id`)
2. Server rows via TanStack Query → `initialMessages` → `hydrate` merge
3. `MESSAGES_SNAPSHOT` from `apps/ai` (server ids) — spec says **replace**, we merge + dedupe by text

That reproduces the old bugs (duplicate user bubbles, hydration guards, `hydrationPaused`, `submitInFlightRef`) inside `@engenty/ai-ui` instead of removing them.

**Verdict from analysis:** Small local fixes help briefly; a durable fix is **one message authority** with AG-UI snapshot semantics — not more patches in the reducer.

---

## North star (Track B)

### Message authority

| Layer | Owns |
|-------|------|
| **`ai.agent_session` + messages** (`apps/ai`) | Canonical transcript and **message ids** after persist |
| **AG-UI SSE run** | In-run streaming (`TEXT_MESSAGE_*`, `TOOL_CALL_*`) and **`MESSAGES_SNAPSHOT`** at run boundaries |
| **`@engenty/ai-ui` conversation store** | Single in-memory `Message[]` updated only by reducer rules below |
| **`modules/engenty-copilot`** | Routes, session list, agent/model pickers, shell — **no** transcript merge logic |
| **Client “pending” UI** (Phase 6) | Composer draft / sending indicator — **not** a second row in canonical `messages` |

### AG-UI-aligned reducer rules (non-negotiable)

1. **`MESSAGES_SNAPSHOT`** → `messages = event.messages` (full replace). No `mergeHydratedAgUiMessages`, no `dedupeConsecutiveAgUiUserMessages`.
2. **`hydrate` (bootstrap only)** → set messages from server fetch **once per session selection** when idle (not during an active run). Same replace semantics, not merge.
3. **During `submitted` / `streaming`** → do not apply query `initialMessages` over the reducer (SSE + snapshot own the turn).
4. **`RunAgentInput.messages`** → built from **current canonical** `messages` plus the new user turn per server contract (see Phase 6 — prefer “server already has history, send only new user message” once persist order is defined).
5. **Delete** text-based dedupe, count-based `shouldSkipAgUiHydration`, and `hydrationPaused` used to paper over dual writers.

### What we are not doing in Track B

- **No** `dedupeConsecutiveAgUiUserMessages` or “same text = same message” heuristics (breaks legitimate repeated user messages).
- **No** client-owned canonical ids that survive hydration (server assigns ids on `appendMessage`).
- **No** parallel hook instances on full-page chat (drawer layer stays unmounted on `/module/engenty-copilot/chat/*` — already fixed; keep guarded).

### Track C (later): local recovery store

Optional **non-canonical** persistence (IndexedDB / `localStorage`) for:

- Composer draft text when the tab closes
- In-flight run id / last event offset if we add resumable streams
- Reconstructing UI when the server has not persisted yet

Must **never** be merged into `messages` as duplicate rows — only reconcile **into** server snapshot or discard. See [phase-8-local-recovery-store.md](./phase-8-local-recovery-store.md).

---

## Hard cutover rules (all tracks)

1. **No fallback shims** — delete the old path in the same phase PR.
2. **No symptom patches** — if the fix is “dedupe by text” or “skip hydrate when count >”, stop and fix authority instead.
3. **Single failure layer** — unsupported AG-UI events fail in `@engenty/ai-ui` / harness.
4. **Verify each phase** — tests + manual rows in [manual-e2e-matrix.md](./manual-e2e-matrix.md).
5. **Update published dev doc** when behavior changes (`ag-ui-apps-ai-session.md`).

---

## Phase index

Completed tracks are summarized here only — per-phase checklist files were removed after sign-off (see [README.md](./README.md)).

### Track A — complete

| Phase | Outcome |
|-------|---------|
| 1 | Route context, naming, artifact split |
| 2 | `useEngentyAgUiAppsAiSession`; module submit stack removed |
| 3 | Drawer/KB on apps/ai; ui-core AI SDK session stack removed |
| 3b | Docs, trash, verification |
| 4 | `RunAgentInput.resume`, interrupt `RUN_FINISHED` |

### Track B — complete

| Phase | Outcome |
|-------|---------|
| 5 | Reducer: `MESSAGES_SNAPSHOT` replace; merge/dedupe removed |
| 6 | One hydrator; pending send UI; no duplicate user rows |
| 7 | Controller cleanup; grep gates |
| 7b | No max update depth on shell + copilot surfaces |

### Track C — optional

| Phase | Doc | Outcome |
|-------|-----|---------|
| 8 | [phase-8-local-recovery-store.md](./phase-8-local-recovery-store.md) | Draft / interrupted-run recovery without polluting canonical messages |

### Track D — CopilotKit-shaped client (active WIP)

Message authority (Track B) is done; **tool and widget lifecycle** is the remaining simplification gap. Task list lives in published WIP (not under `modules/engenty-copilot/dev/phase-*`):

| Doc | Outcome |
|-----|---------|
| [ag-ui-copilotkit-alignment/index.md](../../../docs/content/wip/ag-ui-copilotkit-alignment/index.md) | Hub: problem statement, Track A vs B, non-goals |
| [track-a-copilotkit-shaped-client.md](../../../docs/content/wip/ag-ui-copilotkit-alignment/track-a-copilotkit-shaped-client.md) | **Default:** naming map, one tool status, `useEngentyFrontendTool`, generative UI collapse, single HITL |
| [track-b-react-v2-bridge.md](../../../docs/content/wip/ag-ui-copilotkit-alignment/track-b-react-v2-bridge.md) | **Optional TBD:** CopilotKit React v2 behind `@engenty/ai-ui` after A1+A2 gates |

**Implementer rule (Track D):** If the fix adds a new skip/stale guard without a task id in Track A, stop — implement the workstream instead.

---

## Definition of done — Track B

- [x] `packages/ai-ui/src/ag-ui/conversation.ts` has **no** `dedupeConsecutiveAgUiUserMessages`, `mergeHydratedAgUiMessages`, or `shouldSkipAgUiHydration`
- [x] `MESSAGES_SNAPSHOT` reducer branch assigns `messages` from the event only
- [x] `useEngentyAgUiAppsAiSession` has **no** `hydrationPaused`; **no** `dedupeConsecutiveAgUiUserMessages` on `copilotMessages`
- [x] Submitting “hi” on `/module/engenty-copilot/chat/new` → navigate → **exactly one** user bubble with **server** id after first snapshot (manual E2E — signed off 2026-05-21 / 2026-05-29)
- [x] Reload on `/module/engenty-copilot/chat/:id` matches server transcript and scrolls to bottom (manual E2E — 2026-05-29 operator)
- [x] Drawer + KB hub use the same hook and pending/snapshot rules
- [x] `rg` clean: no merge/dedupe/skip/hydrationPaused in `packages/ai-ui` / `modules/engenty-copilot`
- [x] [manual-e2e-matrix.md](./manual-e2e-matrix.md) Track B rows (5, 5b, 6, 6b, 7) and dupes/reload signed off (2026-05-21 operator)
- [x] [ag-ui-apps-ai-session.md](../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md) describes authority model

---

## Definition of done — Track D

See [Track A definition of done](../../../docs/content/wip/ag-ui-copilotkit-alignment/track-a-copilotkit-shaped-client.md#definition-of-done-track-a). Track D is **not** required to call Track B “done,” but is required before declaring copilot **client polish** finished (no duplicate navigate rows, collapsed widgets, single HITL).

---

## Definition of done — entire copilot chat program

Track A items (hook unification) remain done. Track B items above must be checked before declaring the copilot chat refactor **finished**. Track D gates **operator-visible polish** on the same AG-UI path.

**Also required (Track B — shell stability):**

- [x] No **Maximum update depth exceeded** on `/`, `/module/engenty-copilot/chat/new`, and global drawer open (idle)
- [x] [manual-e2e-matrix.md](./manual-e2e-matrix.md) row **7b** verified
