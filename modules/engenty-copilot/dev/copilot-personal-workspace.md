# Copilot personal workspace

User-scoped Mastra workspace for `engenty.copilot` — one **operator desk** per user × tenant, shared across all copilot sessions and runs.

## Product contract

- **Personal desk:** `tenants/<tenant-id>/ai/workspace/agents/engenty.copilot/users/<user-id>/`
- **Sessions:** transcript-only (`ai.agent_session_message`); no per-session FS root
- **Task work:** additive `/task` mount when task-bound (checkout + existing task prefix)
- **Tenant skills:** read-only mount at `/tenant-skills` → `ai/skills/`

## Mastra features (v1)

| Feature | Enabled | Notes |
| --- | --- | --- |
| Filesystem mounts | Yes | `/home` writable; `/tenant-skills` read-only; optional `/task` |
| Skills discovery | Yes | `skill`, `skill_read`, `skill_search` on `/tenant-skills` |
| BM25 search | Yes | Keyword search over indexed workspace files |
| Sandbox | No | Wrong default for UI copilot |
| Vector/hybrid search | No | Deferred |

## Tools

Mastra **auto-registers** workspace filesystem, skill, and BM25 tools when a `Workspace` is attached to the agent. No custom `@engenty/ai-core` file wrappers in v1.

Existing copilot tools unchanged: `engenty_tools_*`, native frontend tools (e.g. `navigate`; suspend/resume), `chatSessionSearch`, `web_search`, `requestDecision`.

**Write policy:** mount-level — `/tenant-skills` is `readOnly`; `/home` is the personal writable desk; `/task` follows task checkout rules.

See `COPILOT_WORKSPACE_TOOL_POLICY` in `apps/ai/src/ai/threads/copilot-workspace-hook.ts`.

## Code map

| Piece | Location |
| --- | --- |
| Path helpers | `modules/engenty-copilot/src/lib/copilot-workspace.ts` |
| Prefix bootstrap | `modules/engenty-copilot/src/lib/ensure-copilot-user-workspace-prefix.ts` |
| Harness hook | `apps/ai/src/ai/threads/copilot-workspace-hook.ts` |
| Workspace resolver | `apps/ai/src/ai/threads/harness.ts` → `resolveWorkspaceForRun` |

## Out of scope (v1)

- Files UI deep link
- Group-scoped shared copilot workspace
- Per-session FS directories
- Sandbox / LSP
