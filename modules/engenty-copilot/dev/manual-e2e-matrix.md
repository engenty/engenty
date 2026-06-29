# Copilot AG-UI — manual E2E matrix

**Purpose:** QA checklist after session-hook cutover (Track A) and message-authority cutover (Track B). Run against **https://engenty.localhost** with Portless (`pnpm portless:setup`, `pnpm portless:trust`, `pnpm portless:env:sync`) and the dev stack (`pnpm dev` or at minimum `pnpm dev:api` + `pnpm dev:ui` + `pnpm dev:ai`). Set `VITE_ENGENTY_AI_BASE_URL` to the **gateway host only** (e.g. `https://engenty.localhost`, no `/ai` suffix).

**Prerequisites:** `apps/ai` must be up on `:8790` (`curl http://127.0.0.1:8790/ai/health` → 200). If AI crashes on startup with `ENOENT … AGENTS.md`, rebuild `@engenty/engenty-copilot` (`pnpm --filter @engenty/engenty-copilot build`) — prompts resolve from `dist/ai/agents/engenty.copilot/` with source-tree fallback during tsup watch races.

**Automated coverage today:** `@engenty/ai-ui` Vitest (provider/session + scroll helpers), `@engenty/engenty-copilot` Vitest, `@engenty/knowledge-base` KB hub tests, `apps/ai` session-run route tests, and provider cutover grep gates — not full browser E2E.

**Sign-off rule:** Do not check **Verified** or [GOAL.md](./GOAL.md) manual items until a human runs the row and confirms pass criteria.

---

## Track B — shell stability (phase 7b)

| ID | Phase | Surface | Steps | Expected | Verified |
|----|-------|---------|-------|----------|----------|
| **7b** | 7b | App shell | Open `/` (dashboard), `/module/engenty-copilot/chat/new`, open global copilot drawer (idle on each) | Browser console has **no** `Maximum update depth exceeded` (no `setRef` loop in Button/Slot stack) | [x] 2026-05-19 (`127.0.0.1:5173`, logged-in tenant) |

Track B shell stability (phase 7b) — signed off 2026-05-19.

---

## Track B — message authority (phases 5–7)

| ID | Phase | Surface | Steps | Expected | Verified |
|----|-------|---------|-------|----------|----------|
| **5** | 5 | Module `/module/engenty-copilot/chat/new` | Open new chat, send first message (`hi`) | Exactly **one** user bubble after URL becomes `/module/engenty-copilot/chat/:threadId` when idle; bubble uses **server** message id after first `MESSAGES_SNAPSHOT` (not only `pending-send-*`) | [x] 2026-05-21 (operator sign-off) |
| **5b** | 5 | Module session | Reload page on session URL from row 5 | Transcript matches server; **no** duplicate user rows; tool cards in stream order | [x] 2026-05-21 (operator) |
| **6** | 6 | Global drawer | Open copilot drawer, send message (same tenant) | Single user bubble; `pendingSend` clears on snapshot; no second hydrator loop | [x] 2026-05-21 (operator) |
| **6b** | 6 | Drawer → module | While drawer had a message, navigate to `/module/engenty-copilot/chat/*` | Drawer closed; full-page chat does not show duplicate rows for same work | [x] 2026-05-21 (operator) |
| **7** | 6–7 | KB hub | Hub chat with `?chat_kb=` scope, send message | Same as row 5 (one bubble, snapshot authority); KB scope respected in run; **no** global copilot drawer on KB chat URL | [x] 2026-05-21 (operator) |

### Track B smoke (2026-05-19, agent)

| Check | Result |
|-------|--------|
| UI reachable at `http://127.0.0.1:5173/module/engenty-copilot/chat/new` | **Pass** (logged-in tenant) |
| Composer / session list render | **Pass** |
| Submit + stream (rows 5–7) | **Blocked** — page shows transport hint: set `VITE_ENGENTY_AI_BASE_URL` and run `pnpm dev:ai` |
| Rows 5, 5b, 6, 6b, 7 verified | **Not run** — do not check GOAL manual items |
| Agent follow-up 2026-05-19 | **Blocked locally** — `curl` could not reach UI `:5173`, API `:8787`, or AI `:8790`; repo `.env.local` points UI to `https://ai.engenty.localhost`, so manual E2E needs Portless plus `pnpm dev` stack running |

---

## Track A — CopilotKit-shaped tool lifecycle (A1 gate)

| ID | Surface | Steps | Expected | Verified |
|----|---------|-------|----------|----------|
| **A1-navigate** | Module copilot | Ask copilot to navigate (e.g. “navigiere zum profil” / open profile route) | Exactly **one** “Ran navigate” tool row; expand shows single input/output; no stuck running UUID row alongside a completed `call_*` row | [x] 2026-05-29 |
| **A1-reload** | Module session | After A1-navigate, confirm `localStorage` `engenty:threads:active` still points at the navigate session id, then reload the **session URL** `/module/engenty-copilot/chat/:threadId` (not contacts/profile; stale address-bar ids must not clobber last-active) | Same thread reloads; **one** navigate row; transcript order matches server | [x] 2026-05-29 |

**A1 fixes (2026-05-29):** `invoke_frontend_tool` returns stable `call_id`; intent-based tool-row merge in `@engenty/ai-ui`; URL/last-active reconcile via `engenty:copilot:pending-url-thread` + controller guards (no clobber from stale `/chat/:id` in the address bar).

> **Update 2026-06-15:** frontend tools no longer go through an `invoke_frontend_tool` meta-tool. They are native Mastra tools that suspend the run (`context.suspend()`) and resume via `resume[]` on a new run. The stable tool-row identity is now the native `toolCallId`; re-run A1 against the native suspend/resume model. See [frontend-tools.md](../../../docs/content/dev/ai-agents/frontend-tools.md).

### Track A smoke (2026-05-29, operator)

| Check | Result |
|-------|--------|
| A1-navigate single tool row | **Pass** |
| A1-reload preserves last-active thread | **Pass** (after pending-url-thread fix) |
| Row 1 new chat + first message | **Pass** |
| Row 2 reload + scroll to bottom | **Pass** |
| Row 3 cancel mid-stream | **Pass** (abort + resend); stop control → spinner default, red square on hover (2026-05-29) |
| Row 4b decision reload | **Pass** (operator 2026-05-29) |
| Row 4c bad resume | **Skipped** — route covered by `apps/ai` Vitest (`interruptMismatch` / `interruptNotFound`) |
| Rows 8–9 drawer | **Pass** (operator 2026-05-29) |
| Rows 10–11 KB hub | **10 pass** (no flash, `?q=` auto-submit); **11 pass** (suggest dropdown opaque after fix); **chat** failed `unknownAgentType` — fixed by wiring `dynamic.agent_configs` in KB registrar (restart API + `pnpm dev:ai`) |
| Row 13 delete all sessions | **Pass** (operator 2026-05-29; composer refocus after clear/new chat) |
| Row 14 frontend-tool confirm | **Pass** (operator 2026-05-29; inline transcript card, server-save invalidates contact UI) |
| Row 15 generative UI expired | **Skipped** — no chat tool emits `generative-ui` output yet |
| `apps/ai` startup | **Fixed** 2026-05-29 (`resolveCopilotInstructionDir`); run `pnpm --filter @engenty/engenty-copilot build` once if still on old dist |

---

## Track A — hook / interrupt / routing (phases 1–4)

| # | Surface | Steps | Expected | Verified |
|---|---------|-------|----------|----------|
| 1 | Module `/module/engenty-copilot/chat/new` | Open new chat, send first message | Single user row; URL becomes `/module/engenty-copilot/chat/:threadId` when idle; stream completes | [x] 2026-05-29 |
| 2 | Module session | Reload page on session URL after a multi-message thread | Same transcript; tool cards in stream order; viewport **scrolls to the bottom** (latest message visible, not stuck at top) | [x] 2026-05-29 (operator) |
| 3 | Module session | Start a long reply; click composer **Stop** while generating | Run aborts; status **ready**; can send again immediately; default **spinner** while generating, **red stop square on hover** | [x] 2026-05-29 (operator; stop UX polished same day) |
| 4 | Decision artifact | Trigger `requestDecision` (e.g. approval prompt) | Card renders; composer disabled until choice; `resumeInterrupt` continues run; no duplicate user text rows | [x] 2026-05-21 (operator; flaky) |
| 4d | Decision/feedback **docked** (T6.1) | Trigger `requestDecision` ("lass mich aus 3 wählen lassen") and `requestFeedback` | Chooser is **docked directly above the composer** (no divider, no dead gap); **no** inline duplicate; **no** status-flap echo of the HITL tool; pick/submit collapses instantly to the inline summary; persists after reload | [ ] open 2026-06-15 (code landed; awaiting operator) |
| 4e | **Back-to-back** decisions (T6.7) | After choosing in 4d, the agent asks a **second** decision ("wähle eine Aktion") | Second chooser is **interactive and docked** (not "Decision submitted"); single surface; choosing it works and resumes — consecutive HITL in one conversation | [ ] open 2026-06-15 (harness `resumedInterruptIds` fix; awaiting operator) |
| 4b | Decision + reload | Reload session URL while decision card visible | Composer stays disabled; artifact still actionable; resume works; **resolved** cards show chosen label after reload (not generic “Decision submitted”) | [x] 2026-05-29 (operator) |
| 4c | Decision + bad resume | DevTools: resume with wrong `interruptId` | Stream ends with `RUN_ERROR` / service error; no second assistant turn | [—] skipped 2026-05-29 (operator; automated: `agent-sessions-routes.test.ts` interruptMismatch) |
| 8 | Drawer | Open global copilot, send message, tool call | `TOOL_CALL_*` events; tool completes | [x] 2026-05-29 (operator) |
| 9 | Drawer → module | Navigate to `/module/engenty-copilot/chat/*` | Drawer closed | [x] 2026-05-29 (operator) |
| 10 | KB hub | Hub chat with `?chat_kb=` scope | KB scope in run; search respects KB; `?q=` auto-submits on chat URL | [x] 2026-05-29 (operator; chat blocked until registrar fix — retest) |
| 11 | KB hub | 3+ word query (chat input mode) | No autocomplete flash; text preserved; suggest panel opaque | [x] 2026-05-29 (operator; dropdown opacity fixed same day) |
| 12 | Legacy URL | Visit `/chat/:id` (apps/ui) | Redirect to module session route | [x] 2026-05-29 (operator) |
| 13 | Admin | Delete all sessions (if available) | List empty; `/new` works | [x] 2026-05-29 (operator; participant delete + bulk cleanup; composer refocus) |
| 14 | Frontend tool | `requires_confirmation` tool | Confirm UI; approve/reject; reload hydrates banner; resume continues run | [x] 2026-05-29 (operator; inline transcript card; contact UI invalidates on server save) |
| 15 | Generative UI | Expired action button | New chat submit (not stale tool context) | [—] skipped 2026-05-29 (no generative-ui-emitting copilot tool yet) |

*(Legacy matrix IDs 5–7 renamed to Track B table above; drawer/KB rows renumbered 8–11.)*

### Re-verification after Phase 1 detached-runs refactor (2026-06-11, operator)

Phase 1 (detached runs, SSE attach endpoint, server-side cancel, realtime reattach) replaced the
run transport under these rows — re-ran the affected ones:

| Row | Result |
|-----|--------|
| Track B 7b (no max-update-depth) | **Pass** (BaseUI `nativeButton` console warning found + fixed same day in `session-list-item.tsx`) |
| Track B 5 (one user bubble) | **Pass** (first attempt hit apps/ai crash on duplicate `agent_run` insert — fixed same day in `run-tracking.ts`/`detached-run.ts`; retest passed) |
| Track B 5b (reload matches server) | **Pass** |
| Track B 6 (drawer single bubble) | **Pass** |
| Track B 6b (drawer → module no dupes) | **Pass** |
| Track B 7 (KB hub chat) | **Blocked** — KB module missing from app bar; suspected wrong-origin test URL (`127.0.0.1:5173` instead of `https://engenty.localhost`); retest pending |
| Track A 1 (new chat + first message) | **Pass** |
| Track A 2 (reload multi-message thread) | **Pass** |
| Track A 3 (composer Stop while generating) | **Pass** — now exercises server-side `cancelAiRun` (Phase 1.6) |
| Track A 4 (requestDecision card) | **Pass** |
| Track A 4b (decision + reload) | **Pass** (composer/chat input functional) |

---

## Phase 1.7 — detached-run E2E gate (server contract verified 2026-06-14, agent)

**Method.** The 1.7 matrix rows are *browser* actions, but each rides on a server contract
(detached executor + bus + coalesced persistence + `/runs/:id/stream` attach + `/runs/:id/cancel`
+ boot sweep). Those were exercised **live** against the running stack via an API harness
(`/tmp/p1.mjs`, not committed): dev-login bearer (`matthias@engrd.at`), `agent_id=engenty.copilot`,
real model runs against `https://ai.engenty.localhost`. This proves the machinery the client
consumes; it does **not** replace a human confirming the visual/UX rows (sign-off rule still holds).

| 1.7 item | Server contract | Evidence (2026-06-14) | Browser-visual |
|----------|-----------------|------------------------|----------------|
| 1. Reload mid-stream → transcript complete incl. detached text; stream continues | **PASS** | Client disconnected at 2.5 s (0 text yet); run kept `status=running` while detached; reattach `?since=-1` replayed full **8852-char** transcript ending `RUN_FINISHED`; row `succeeded`. Text grew 0 → 8852 entirely while no client attached. | ⏳ pending human (visual re-hydration on real page reload) |
| 2. Same thread in two browsers → both render same run live | **PASS** | Two concurrent `?since=-1` attachers to one running run got **byte-identical** streams: 1539 events, 8761 chars, both saw `RUN_FINISHED`. | ⏳ pending human (two real browsers) |
| 3. Stop cancels (run row cancelled, both clients stop) | **PASS** | `POST /runs/:id/cancel` → 200; DB row → `status=cancelled`; both the originating POST stream and a concurrent attacher terminated (no hang). | ⏳ pending human (composer **Stop** button → already re-verified 2026-06-11 Track A row 3) |
| 4. HITL / frontend-tool confirm through detach + reattach | **not run via API** | Interrupt/resume is inherently a UI modal flow; server resume mechanics covered by `agent-sessions-routes.test.ts`. | ⏳ pending human (Track A rows 4 / 14 cover the modal) |
| 5. Kill apps/ai mid-run → run shows failed/executor_lost, clean error, no zombie | **PASS** | Forced an apps/ai restart mid-run (touched `src/index.ts` → tsx-watch bounce; new PID, no git diff). Boot sweep set DB row `status=failed`, `error_code=executor_lost`, `error_message="Process restarted while run was in progress"`. Attach after restart replayed persisted events and **closed without hanging**. | ⏳ pending human (client shows clean error in UI) |
| 6. Chatbot public/embed ingress regression | **not testable here** | Chatbot module is **not migrated** in this dev DB (no `chatbot` schema, 0 chatbots). Same detached path; `chatbot_`-prefixed branch present at `agent-session-runs-routes.ts:121`. | ⏳ needs a configured chatbot + embed key |

### Findings (worth fixing / noting)

1. **`GET /ai/v1/runs/:id` omits the structured `error_code`.** The run serializer exposes
   `status` + `error` (the human message) but **not** `error_code`. DB had
   `error_code=executor_lost`; the API surfaced only `status=failed` + `error="Process restarted…"`.
   Functionally the client can show a clean error, but consumers can't branch on the machine code.
   *Minor — surface `error_code` in the run/summary serializer.*
2. **Cancel emits `RUN_FINISHED`, not `RUN_ERROR`.** On `POST /runs/:id/cancel` the live stream
   closed with `RUN_FINISHED` while the row is `cancelled`. Clients must treat the **row status** as
   the source of truth, not the terminal stream event. (No hang; acceptable, but note it.)
3. **Post-sweep attach has no synthetic terminal event.** D6/1.4's synthetic `RUN_ERROR(executor_lost)`
   only fires in the narrow window when the row is still `running` but not live in-process. Once the
   boot sweep flips the row to `failed`, attaching replays persisted events then closes with **no**
   terminal `RUN_*` event. No hang (stream closes), and the client's `maybeReplayTerminalRunEvents`
   recovery path reconciles against the row, but there's no in-band error tick for late attachers.

### Still required for full 1.7 sign-off (human, in a browser)

- Items 1, 2, 3, 5: confirm the **visual** behavior in the real app at `https://engenty.localhost`
  (page reload re-hydration, two browsers side-by-side, composer Stop, clean error banner on restart).
- Item 4: run Track A rows 4 / 14 through a detach+reattach cycle.
- Item 6: provision a chatbot + public embed key and smoke a guest run end-to-end (also a Phase 6 dep).

---

## Regression grep (pre-release)

Run from repo root (expect **no matches** in application code for first two commands):

```bash
# Track B — no symptom patches
rg 'dedupeConsecutiveAgUiUserMessages|mergeHydratedAgUiMessages|shouldSkipAgUiHydration|hydrationPaused' \
  packages/ai-ui modules/engenty-copilot apps/ui --glob '*.{ts,tsx}'

# Track A — no legacy copilot submit stack
rg 'use-chat-submit|useCopilotSession|agent-chat-hydration' modules/engenty-copilot --glob '*.{ts,tsx}'

# Module chat uses provider hooks (not direct apps/ai session hook in module UI)
rg 'useEngentyAgUiAppsAiSession' modules/engenty-copilot/ui --glob '*.{ts,tsx}'
rg 'useCopilotSelectedThread|useCopilotThreadBinding' modules/engenty-copilot/ui/pages/chat-page.tsx
```

Expected: **zero** hits for `useEngentyAgUiAppsAiSession` in module UI; chat page uses `useCopilotSelectedThread`.

```bash
rg -n "useCopilotSession|use-chat-submit|buildAgentUiRunContext" apps modules packages --glob '!**/dev/**'
rg -n 'copilot\.(composer|breadcrumb)' modules/engenty-copilot/ui
```

---

## Notes

- Decision flow uses official AG-UI interrupt outcome + `resume[]` only — see [frontend-tool-interrupt-resume.md](./frontend-tool-interrupt-resume.md) and [CopilotKit alignment](../../../docs/content/wip/ag-ui-copilotkit-alignment/index.md).
- Track B authority: `MESSAGES_SNAPSHOT` full replace; `suppressHydration` during `submitted`/`streaming` only — **not** `hydrationPaused` or text dedupe.
- Track A row 2 scroll: after transcript hydrate, force bottom snap (`use-copilot-panel-transcript-scroll`); do not treat initial layout as “user scrolled away”.
- Track A row 3 stop: composer passes `onStop` to `PromptInputSubmit` (`CopilotPanelContent` → `host.cancel` / `session.cancelRun`). While generating: **spinner** by default; **filled red stop square on hover** (not a persistent outline stop button).
- Track A row 4b reload: harness persists `choices` on `ag_ui_open_interrupt`; client `resolveDecisionArtifactForToolCall` falls back to session metadata when hydrated transcript output lacks choices; on **resume**, server merges `choice_id` / `choice_label` onto the persisted `requestDecision` tool row so reload shows the chosen label.
- Track A row 13 delete-all: `clearAppsAiThreadsForHost` bulk delete + optimistic empty cache; participant may delete sessions; composer refocus via `composerFocusKey` after clear/new chat.
- Track A row 14 frontend-tool confirm: `FrontendToolConfirmToolCallCard` in transcript (not top banner only); no fake “Thinking …” during `requires_confirmation`; `useCopilotAssistantTurnFinish` + approve invalidates module queries (e.g. contacts detail after server save).
- Track A row 15 generative UI expired: **deferred** — renderer landed; no copilot backend tool emits `__type: "generative-ui"` for manual E2E yet.
- Phase 8 (composer draft `localStorage`) remains **deferred** — see [phase-8-local-recovery-store.md](./phase-8-local-recovery-store.md).
- File issues with session id, run id, and `interrupt_id` / `artifact_id` when testing decision cards.
- **KB / migrations (2026-05-29):** If `pnpm db:migrate` fails with `Remote migration versions not found … 20260521143000`, that version came from removed `brand-manager`. Repair: `supabase migration repair --local --status reverted 20260521143000`, then re-run `pnpm db:migrate`. KB backend needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` at API startup (68 routes when loaded); admin “Nicht geladen” + 0 routes usually means missing Supabase env or stale API process — restart `pnpm dev:api` after migrate.
