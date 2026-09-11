---
title: "@engenty/ai-core cleanup plan"
description: Phased removal of retired orchestrator runtime, stale exports, and doc drift after apps/ai AG-UI cutover.
---

# @engenty/ai-core — cleanup plan

**Status:** **Complete** (Phases A–E, 2026-05-29). Orchestrator subtree removed; exports slimmed; runtime split into `src/ag-ui/` and `src/agent-ui/`; tools canonical under `ai/tools/`; biome lint wired; docs synced.  
**Verified:** 2026-05-29 via repo grep — product chat is **`apps/ai` AG-UI**; core orchestrator routes and `runChatRuntime` were retired per [TRASHBIN.md](../../../TRASHBIN.md) (2026-05-28).

| Phase | Scope | Status |
|-------|--------|--------|
| A | Zero-consumer runtime leaves | Done |
| B | Retired orchestrator subtree + module orchestrator tests | Done |
| C | Slim `index.ts` / `browser.ts` exports | Done |
| D | Canonical `ai/tools/` + thin `src/tools/` re-exports | Done |
| E | `ag-ui/` / `agent-ui/` split, biome, docs alignment | Done |

## Executive summary

`@engenty/ai-core` should shrink from a **dual-purpose** package (live shared library + archived core orchestrator) into a **focused agentic SDK**: module registration, dynamic-agent contracts, Mastra tool builders, usage/model config, AG-UI message helpers, and a thin browser entry.

The retired **orchestrator execution stack**, **store facades**, and **catalog/instruction sync** trees were removed in Phases A–B. What remains is the focused agentic SDK described in [README.md](../README.md).

**North star:** One package boundary — server: `import "@engenty/ai-core"`; browser: `import "@engenty/ai-core/browser"` — with no Node-only graph in Vite bundles.

---

## What stays (verified live consumers)

| Area | Key paths | Consumers (examples) |
|------|-----------|----------------------|
| Registry & loaders | `src/registry.ts`, `src/actions/loader.ts`, `src/skills/loader.ts` | `apps/core` plugin registry, all module `registerAiRegistration` |
| Dynamic contracts | `src/dynamic-contracts.ts` | `apps/ai` registry, modules (`AgentConfig`, `MastraToolDefinition`) |
| Config & tenant AI | `src/config/*`, `src/tenant-ai-settings.ts` | `apps/ai`, `apps/core`, modules (KB, file storage) |
| Usage | `src/usage/*` | `apps/ai` DAL, usage routes, limit checks |
| AG-UI messages | `src/ag-ui/ag-ui-messages.ts` | `@engenty/ai-ui` (via `@engenty/ai-core/browser`) |
| Agent UI prompt | `src/agent-ui/agent-prompt-context-from-ui.ts` | `apps/core` `ai-agent-system-prompt-routes`, `apps/ai` harness |
| Frontend-tool gating | `src/agent-ui/agent-ui-frontend-tool-gating.ts` | `apps/ai` session harness |
| Parallel fan-out | `src/runtime/parallel-tasks.ts` | `modules/contacts` austria lookup tool |
| Session title (browser) | `src/runtime/initial-session-title.ts` | `@engenty/ai-ui`, tasks run observer |
| Thread id helper | `src/runtime/agent-thread-id.ts` | `@engenty/ai-ui` |
| Layered prompts | `src/instructions/compose-agent-prompt.ts`, `copilot-seed-files.ts` | `modules/engenty-copilot` instructions |
| Agent manifests | `src/agents/agent-manifest.ts`, `copilot-agent-manifest.ts`, `copilot-constants.ts` | Manifest loaders; canonical **`agent.json`** in `modules/engenty-copilot/ai/agents/engenty.copilot/` |
| Tools (Mastra) | `ai/tools/*` + thin `src/tools/*` re-exports | `apps/ai`, modules, `apps/core` gateway/catalog |
| Extract | `src/extract/email-contact.ts` | `modules/inbox`, contacts tools |
| Models list | `src/models/supported*.ts` | Admin UI, KB settings (browser) |
| Artifacts schema | `src/artifacts/field-suggestions.ts` | Dynamic agents / HITL payloads |
| Contracts (trimmed) | `src/contracts.ts`, `src/inbound-contracts.ts` (partial) | Types for registrations; prune orchestrator-only types in Phase C |

---

## Phase A — Safe leaf removals (zero production importers)

**Goal:** Delete files with **no** `apps/*`, `modules/*`, or `packages/*` imports outside `packages/ai-core` (grep-verified 2026-05-29).

### Files to remove

| File | Notes |
|------|--------|
| `src/runtime/ui-message-text.ts` | Superseded by `ag-ui-messages.ts`; only exported from `index.ts` |
| `src/runtime/copilot-ui-context-prompt.ts` | Only referenced by its `__tests__`; copilot context now via agent-ui / harness |
| `src/runtime/runtime-progress-bridge.ts` | Test-only (`runtime-progress-bridge.test.ts`) |
| `src/runtime/tool-progress-callbacks.ts` | Test-only (`tool-progress-callbacks.test.ts`) |
| `src/agents/engenty.copilot/agent.json` | Duplicate of `modules/engenty-copilot/ai/agents/engenty.copilot/agent.json`; drop `cp -R src/agents dist/agents` copy step when file gone |
| `src/runtime/events.ts` | Remove **`CopilotProgressEvent`** deprecated alias; keep `RuntimeProgressEvent` if still needed by adapters |

### Export changes (`index.ts`, `browser.ts`)

- Remove `buildUiMessagesFromSessionMessages`, `extractTextFromUiMessageParts`, `normalizeUiMessageForPersistence` from `ui-message-text`.
- Remove `CopilotProgressEvent` export.
- **`createAiSdkUiStreamToAgUiAdapter`:** removed with AG-UI migration (2026-05). `ag-ui-event-adapter.ts` is **runtime progress → AG-UI events** only — no AI SDK UI stream adapter remains.

### Prerequisites

- None (grep clean).

### Blockers

- None.

### Tests

- Delete: `src/runtime/__tests__/copilot-ui-context-prompt.test.ts`, `runtime-progress-bridge.test.ts`, `tool-progress-callbacks.test.ts`.
- `ag-ui-event-adapter.test.ts` covers `runtimeProgressToAgUiEvent` only (AI SDK stream adapter removed).

### Docs (this phase)

- `packages/ai-core/README.md` — remove `ui-message-text`, `chat-runtime.ts` references from layout tree.
- `docs/content/dev/ai-agents/copilot.md` — **Done (2026-05-29):** page deleted; live path in `ag-ui-apps-ai-session.md`.
- `.cursor/rules/ai-core-docs.mdc` — no new how-tos; note cleanup plan link.

### Risk / rollback

- Low. Restore files from git if a hidden dynamic import appears.

### Suggested PR

**PR-A1:** `chore(ai-core): remove zero-consumer runtime leaves`

---

## Phase B — Retired orchestrator subtree

**Goal:** Remove the **core-era execution stack** (`runOrchestrator`, inbound routing, store facades, general-chat agent wiring) now that **no production code** calls it (only ai-core tests + three module integration tests).

### B1 — Runtime execution & routing

| File / folder | Role |
|---------------|------|
| `src/runtime/orchestrator.ts` | `runOrchestrator` |
| `src/runtime/run-agent-once.ts` | `runAgentOnce` |
| `src/runtime/inbound-router.ts` | Re-exports `routeInboundEvent` |
| `src/runtime/inbound-agent-routing.ts` | `routeInboundEvent` |
| `src/runtime/inbound-llm-routing.ts` | LLM routing branch |
| `src/runtime/inbound-session.ts` | Session resolution for router |
| `src/runtime/inbound-trigger.ts` | Trigger normalization |
| `src/runtime/copilot-slash-command.ts` | Slash commands |
| `src/runtime/copilot-action-resolve.ts` | Action resolution |
| `src/runtime/heartbeat.ts` | `evaluateHeartbeatPolicy`, `prepareHeartbeatWakeRequest` |
| `src/runtime/request-manager.ts` | `prepareInvocationRequest`, `claimInvocationRequest` |
| `src/runtime/message-history.ts` | UI message text extraction for router |
| `src/runtime/context-snapshot.ts` | Run context snapshot |
| `src/runtime/validate-registered-action-input.ts` | Action input validation |
| `src/runtime/session-state.ts` | `getSessionSnapshot`, `upsertSessionState` |
| `src/runtime/deterministic-session-id.ts` | Orchestrator session ids |
| `src/runtime/session-title-generation.ts` | **Distinct** from `initial-session-title.ts` (keep latter) |
| `src/runtime/triggers/handler.ts`, `triggers/types.ts` | `normalizeInvocationTrigger` |
| `src/runtime/inbound-routing-user-error.ts` | Routing errors |
| `src/runtime/__tests__/orchestrator.test.ts` | |
| `src/runtime/__tests__/run-agent-once.test.ts` | |
| `src/runtime/__tests__/inbound-router.test.ts` | |
| `src/runtime/__tests__/heartbeat.test.ts` | |
| `src/runtime/__tests__/session-state-workspace.test.ts` | |
| `src/runtime/__tests__/deterministic-session-id.test.ts` | |
| `src/runtime/__tests__/session-title-generation.test.ts` | |
| `src/runtime/__tests__/message-history.test.ts` | |
| `src/runtime/__tests__/copilot-slash-command.test.ts` | |
| `src/runtime/__tests__/copilot-action-resolve.test.ts` | |
| `src/runtime/__tests__/inbound-routing-user-error.test.ts` | |
| `src/runtime/triggers/__tests__/handler.test.ts` | |

### B2 — Agent binding & copilot orchestrator definition

| File | Notes |
|------|--------|
| `src/agents/binding.ts` | `bindAgentInvocation` — only orchestrator + tests |
| `src/agents/general-chat.ts` | `engentyCopilotAgentDefinition` — **no** external TS importers |
| `src/workflows.ts` | Only imported by `general-chat.ts` |
| `src/agents/__tests__/binding.test.ts` | |

Keep **`copilot-agent-manifest.ts`** (manifest schema used by module tree).

### B3 — Orchestrator-only tools

| File | Notes |
|------|--------|
| `src/tools/delegate-to-agent-tool.ts` | Only `general-chat.ts` |
| `src/tools/memory-tool.ts` | Only `general-chat.ts` + memory tests |
| `src/tools/__tests__/memory-tool.test.ts` | |

### B4 — Store facades & sync (no production `configure*` callers outside tests)

| Area | Files |
|------|--------|
| Requests | `src/requests/store.ts`, `policies.ts`, `__tests__/policies.test.ts` |
| Runs | `src/runs/store.ts`, `events.ts`, `summaries.ts`, `__tests__/lifecycle.test.ts` |
| Sessions | `src/sessions/store.ts` |
| Catalog sync | `src/catalog/sync.ts`, `store.ts` (evaluate: keep **types** / json-schema if admin needs; drop sync + configure if unused) |
| Instruction sync | `src/instructions/sync.ts`, `store.ts` (same — keep compose/registry/resolver/copilot-seed-files) |
| Files sync | `src/files/sync.ts`, `store.ts` (audit `syncInstructionFileSeeds` / `syncSkillFileSeeds` exports) |
| Workspaces | `src/workspaces/store.ts` (only memory-tool tests) |

**Prerequisite audit before B4:** Grep `configureActionCatalogStore|configureInstructionStore|syncCatalogSeeds|syncInstructionSeeds` across repo after B1; if only tests remain, delete stores in same PR series.

### B5 — Module orchestrator tests (relocate or delete)

| File | Action |
|------|--------|
| `modules/contacts/ai/__tests__/orchestrator.test.ts` | **Delete** — tests retired `runOrchestrator` path |
| `modules/leads/ai/orchestrator.test.ts` | **Delete** |
| `modules/company-profile/ai/orchestrator.test.ts` | **Delete** |

Replace with **apps/ai** harness tests or module **registrar** tests only if coverage gap is identified.

### Prerequisites

- Phase A merged (smaller export surface).
- Confirm `apps/core` does not call `runOrchestrator`, `routeInboundEvent`, or `configure*Store` (grep — currently **no**).
- Confirm `apps/ai` uses **local** `createAgentRunStore`, not ai-core run store (verified).

### Blockers

| Blocker | Mitigation |
|---------|------------|
| Fumadocs still describe orchestrator as live | Phase E doc pass |
| `docs/content/wip/dynamic-agents/phase-3-supervisor.md` checkbox mentions inbound-router blocked on `runChatRuntime` | Update checkbox — blocker cleared 2026-05-28 |
| Heartbeat automation doc references `runOrchestrator` | Point to `apps/ai` `ai.workflow_run` queue |

### Test migration notes

- **Do not port** orchestrator tests to apps/ai wholesale — behavior is different (Mastra harness, dynamic supervisor).
- Keep: `ag-ui-messages.test.ts`, `agent-prompt-context-from-ui.test.ts`, `parallel-tasks.test.ts`, `agent-thread-id.test.ts`, tool tests under `ai/tools/**/__tests__`.
- Module tests that only assert `routeInboundEvent` ranking: **delete** or replace with registrar smoke tests (`registrar.test.ts` pattern).

### Docs (this phase)

- **Done (2026-05-29):** `docs/howto-orchestrator-runtime.md` deleted; `docs/content/dev/ai-agents/orchestrator.md`, `flow.md`, `copilot.md` deleted; `README.md` updated for live path.
- `packages/ai-core/AGENTS.md` — remove orchestrator layout bullets.
- `docs/content/wip/ai-app/migration-gaps.md` — update ai-core section.

### Risk / rollback

- Medium: large diff. Land **B1 → B2 → B3 → B4 → B5** as separate PRs.
- Rollback: revert PR series; no DB migration involved.

### Suggested PRs

| PR | Scope |
|----|--------|
| **PR-B1** | Runtime execution + routing + related `__tests__` |
| **PR-B2** | `binding.ts`, `general-chat.ts`, `workflows.ts` |
| **PR-B3** | delegate/memory tools |
| **PR-B4** | requests/runs/sessions/catalog/instruction/file/workspace stores + sync |
| **PR-B5** | Module `orchestrator.test.ts` deletion |

---

## Phase C — Slim public API (`index.ts` / `browser.ts`)

**Goal:** Export only symbols with **documented** consumers; move test-only helpers to `_internal` or stop exporting.

### `index.ts` — remove (after Phase B)

- All orchestrator exports: `runOrchestrator`, `runAgentOnce`, `bindAgentInvocation`, `routeInboundEvent`, `resolveSession`, heartbeat APIs, request/run/session stores, `syncCatalogSeeds`, `syncInstructionSeeds`, `engentyCopilotAgentDefinition`, delegate/memory tools, etc.
- Trim `contracts.ts` / `inbound-contracts.ts` types that only served orchestrator DTOs (keep registration + dynamic capability types).

### `browser.ts` — tighten

**Keep:** `ag-ui-messages`, `agent-thread-id`, `initial-session-title`, tenant AI parse, usage types, model lists, chat model resolution, AG-UI SSE helpers used by ai-ui.

**Review:**

- ~~`createAiSdkUiStreamToAgUiAdapter`~~ — removed (2026-05); no action.
- Consider exporting `GENERAL_CHAT_AGENT_ID` from browser (already imported by `copilot-instructions-info-card.tsx` — verify build graph).

### Prerequisites

- Phases A + B complete.

### Blockers

- External packages importing removed symbols — run `pnpm check` + ripgrep after each export removal.

### Suggested PR

**PR-C1:** `refactor(ai-core): slim package exports`

---

## Phase D — Finish tool layout migration (`src/tools` → `ai/tools`)

**Goal:** Single canonical tree per [AGENTS.md](../../../AGENTS.md) — implementations under `ai/tools/<kebab-name>/`, `src/tools/` only re-exports.

### Current state

| `ai/tools/` (canonical) | `src/tools/` (shim) |
|-------------------------|---------------------|
| `chat-session-search/` | `chat-session-search-tool.ts` |
| `request-decision/` | `request-decision-tool.ts` |
| `web-search/` | `web-search.ts` |
| `engenty-api/` | `engenty-api.ts` |
| `engenty-api-catalog/` | `engenty-api-catalog.ts` |
| — | `delegate-to-agent-tool.ts`, `memory-tool.ts` (Phase B delete) |
| — | `types.ts` (move to `ai/tools/context/types.ts` or keep shared) |

### Tasks

1. Collapse `src/tools/*.ts` to one-line re-exports from `../../ai/tools/...`.
2. Point `index.ts` exports at `ai/tools` paths (or keep shims until one PR).
3. Ensure `tsup` bundles `ai/tools` (already compiled via imports from `index.ts`).
4. Update `docs/howto-build-tools.md` — remove duplicate paths.

### Prerequisites

- Phase B3 (delegate/memory removed).

### Suggested PR

**PR-D1:** `refactor(ai-core): canonical ai/tools re-exports`

---

## Phase E — Structure, biome, and documentation

### Runtime folder split (post-cleanup)

```text
packages/ai-core/src/
├── ag-ui/              # ag-ui-messages, ag-ui-event-adapter, events
├── agent-ui/           # agent-prompt-context-from-ui, frontend-tool-gating, app-navigation-paths-prompt
├── runtime/            # parallel-tasks, initial-session-title, agent-thread-id
```

**Rule:** No file &gt; ~250 lines mixing concerns — split `contracts.ts` if needed (registration vs usage types).

### Biome

- `package.json` has `"lint": "echo 'No lint yet'"` — wire `"lint": "biome check --write ."` (or repo root filter).
- Add `packages/ai-core` to root biome scope if missing.
- Run after each PR: `pnpm exec biome check --write packages/ai-core`.

### Documentation alignment

| Doc | Action |
|-----|--------|
| `packages/ai-core/README.md` | Rewrite overview: registry + tools + AG-UI helpers; remove orchestrator Mermaid |
| `docs/howto-orchestrator-runtime.md` | **Done:** deleted; link `cleanup-plan.md` + AG-UI session doc from hubs |
| `docs/howto-ai-config.md` | Remove `runChatRuntime`, `apps/core/ai/agents` paths; module copilot paths |
| `docs/howto-build-tools.md` | Single `ai/tools/` tree |
| `docs/howto-artifacts-hitl.md` | Confirm Mastra `context.writer` path only |
| **Missing how-tos** | **Resolved (Phase E):** `howto-register-module-capability`, `howto-add-specialist`, `howto-coordinator-sticky` — retired; documented in `.cursor/rules/ai-core-docs.mdc` (do not recreate) |
| Fumadocs symlink `docs/content/dev/packages/ai-core/` | Sync frontmatter after how-to changes |
| `docs/dev/agent-ui-runtime.md` | Replace “orchestration in ai-core” wording |
| `docs/content/dev/ai-agents/*` | **Done:** retired orchestrator-era pages deleted; live pages link AG-UI doc |

### AGENTS.md updates (repo + package)

- Root [AGENTS.md](../../../AGENTS.md): ai-core tools path already correct; point cleanup plan.
- [packages/ai-core/AGENTS.md](../AGENTS.md): Remove orchestrator commands; add cleanup plan link; fix browser vs server split.

### Suggested PRs

| PR | Scope |
|----|--------|
| **PR-E1** | README + how-tos + Fumadocs |
| **PR-E2** | Folder split (`ag-ui/`, `agent-ui/`) + biome lint script |
| **PR-E3** | Add missing how-to stubs or prune ai-core-docs.mdc list |

---

## TRASHBIN.md — burn-down (complete)

These items were appended to [TRASHBIN.md](../../../TRASHBIN.md) during the cleanup series and are **checked off** as of 2026-05-29:

```markdown
- [x] @engenty/ai-core Phase A — remove zero-consumer runtime leaves. Plan: packages/ai-core/docs/cleanup-plan.md
- [x] @engenty/ai-core Phase B — remove retired orchestrator subtree. Plan: packages/ai-core/docs/cleanup-plan.md
- [x] @engenty/ai-core Phase C — slim `index.ts` / `browser.ts` exports. Plan: packages/ai-core/docs/cleanup-plan.md
- [x] @engenty/ai-core Phase D — finish `ai/tools/` migration. Plan: packages/ai-core/docs/cleanup-plan.md
- [x] @engenty/ai-core Phase E — runtime folder split, biome lint wired, Fumadocs + AGENTS alignment. Plan: packages/ai-core/docs/cleanup-plan.md
- [x] Module orchestrator integration tests — deleted after Phase B. Plan: packages/ai-core/docs/cleanup-plan.md
- [x] Fumadocs ai-agents pages — historical banners + AG-UI live path links. Plan: packages/ai-core/docs/cleanup-plan.md
```

---

## Suggested PR breakdown (review order)

```mermaid
flowchart LR
  A[PR-A1 leaves] --> B1[PR-B1 runtime]
  B1 --> B2[PR-B2 agents]
  B2 --> B3[PR-B3 tools]
  B3 --> B4[PR-B4 stores]
  B4 --> B5[PR-B5 module tests]
  B5 --> C[PR-C1 exports]
  C --> D[PR-D1 tools layout]
  D --> E[PR-E1 docs]
  E --> E2[PR-E2 structure biome]
```

| Order | PR | Est. size | Review focus |
|-------|-----|-----------|----------------|
| 1 | A1 | S | Export grep, vitest |
| 2 | B1 | L | No accidental apps/ai import breaks |
| 3 | B2 | M | engenty-copilot still builds instructions |
| 4 | B3 | S | Tool registry ids unchanged |
| 5 | B4 | L | Confirm no hidden configure* in apps |
| 6 | B5 | S | Module CI |
| 7 | C1 | M | Downstream compile |
| 8 | D1 | S | Import paths |
| 9 | E1–E3 | M | Docs only / structure |

---

## Verification commands (each PR)

```bash
pnpm --filter @engenty/ai-core test
pnpm --filter @engenty/ai-core build
rg 'runOrchestrator|runChatRuntime|bindAgentInvocation' --glob '*.{ts,tsx}'  # expect tests/docs only, then none
rg '@engenty/ai-core' apps modules packages --glob '*.{ts,tsx}' | rg -v 'node_modules'
pnpm exec biome check --write packages/ai-core   # after Phase E2
```

---

## Open questions

| Question | Default recommendation |
|----------|------------------------|
| Keep `inbound-contracts.ts` types for future routing? | Keep minimal `InboundEvent` types only if modules still reference; else delete with Phase B |
| Keep `catalog/store.ts` for admin? | Grep at Phase B4; apps/ai has own registry store |
| Archive vs delete `howto-orchestrator-runtime.md`? | **Done:** deleted 2026-05-29 |
| `app-navigation-paths-prompt.ts` | Keep if harness inlines paths; else move next to engenty-copilot module |

---

## References

- [TRASHBIN.md](../../../TRASHBIN.md) — `runChatRuntime` removed 2026-05-28
- [agentic-framework-tracker.md](../../../docs/dev/wip/agentic-framework-tracker.md) — milestone row for this plan
- [ag-ui-apps-ai-session.md](../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md) — live product path
- [agent-ui-runtime.md](../../../docs/dev/agent-ui-runtime.md) — UI state / frontend tools
