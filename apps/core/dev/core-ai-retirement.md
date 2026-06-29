# Core AI retirement (knowledge base)

**Status:** complete in core (2026-05-21)  
**Rebuild target:** `apps/ai` (+ Mastra workspace cutover)  
**UI:** `@engenty/ai-ui` kept as-is — wire HTTP clients to `apps/ai` when routes land.

Archived implementation: `.trash/schema-split-core-ai-complete-2026-05-21/`

---

## What was removed from `apps/core`

### HTTP (`/api/admin/ai/*`, `/api/ai/*`)

| Surface | Was | Rebuild in |
|---------|-----|------------|
| Agent catalog (read) | `ai-admin-routes` + `registerAiRegistration` merge | `apps/ai` registry + module discovery |
| Chat prefs | `engenty_tenant_agent_chat_prefs` | `apps/ai` tenant agent policy |
| Instructions CRUD | `engenty_instruction_*` (already dropped) | Module `ai/` markdown + workspace `SKILL.md` |
| Heartbeat / triggers | `ai-heartbeat-*`, `ai.action_request` queue | `apps/ai` `/ai/v1/automation/*` |
| Sessions / runs / usage | orchestrator stubs | `apps/ai` `/ai/sessions`, `/ai/v1/runs`, usage routes |
| Doc converter probe | `GET /api/ai/doc-converter/availability` | `apps/ai` or shared infra route |
| Dashboard widget AI | `apps/core/ai/workflows/*` | `apps/ai` or separate service |

Core now registers **`registerCoreAiRemovedRoutes`** → uniform **404** with `CORE_AI_REMOVED_FROM_CORE_MESSAGE`.

### DAL / boot

- `apps/core/src/dal/orchestrator/*` — instructions, chat prefs, workspaces, heartbeat requests, ai run reads
- Boot: `configureInstructionStore`, `configureActionRequestStore`, `configureWorkspaceStore`, `syncInstructionSeeds`, `registerCoreAiRegistrations` (copilot/dashboard seeds)
- `ensureAutomationHookRuntime` + `core.engenty_automation_rules`

### Tables dropped (core schema)

- `engenty_instruction_docs`, `engenty_instruction_changes` (20260521190000)
- `engenty_tenant_agent_chat_prefs`, `engenty_automation_rules` (20260521200000)
- Earlier: sessions, runs, usage, catalog, `engenty_action_requests` (queue → `ai.action_request`)

### Kept in core (not orchestrator runtime)

| Piece | Why |
|-------|-----|
| `registerAiRegistration` on plugin load | Module manifest discovery; `apps/ai` can consume via future core API |
| `unregisterAiRegistration` on plugin unload | Lifecycle cleanup |
| `apps/core/src/dal/tenant-ai-config.ts` | Tenant `settings/ai` row for gateway models (read by dashboard non-AI paths + `apps/ai`) |
| Tool catalog methods (`engenty_tools_*`) | Agent calls core HTTP/operations — not chat persistence |
| Chat search/index-health methods | Fail-fast stubs pointing at `apps/ai` |
| Gateway proxy `/ai` → `apps/ai` | Product AI service |

---

## `@engenty/ai-ui` (unchanged)

Admin and settings UI still call legacy core paths (`/api/admin/ai/*`, `/api/ai/triggers`, etc.). Expect **404** until clients are pointed at `apps/ai` equivalents.

Planned mapping:

| UI client | Target |
|-----------|--------|
| `ai-runtime-api.ts` agents/actions/skills | `apps/ai` `/ai/v1/registry/*` |
| `instruction-settings-api.ts` | Workspace / module file paths |
| Heartbeat settings | `apps/ai` automation routes |
| Agent memory admin | Vault / workspace API |

---

## Related cutover docs

- [apps/ai/dev/schema-split-cutover/README.md](../../ai/dev/schema-split-cutover/README.md)
- [apps/ai/dev/dynamic-agents-workspace-cutover.md](../../ai/dev/dynamic-agents-workspace-cutover.md)
- [apps/ai/dev/heartbeat-automation-cutover.md](../../ai/dev/heartbeat-automation-cutover.md)
