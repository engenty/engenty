# Copilot personal workspace

User-scoped Mastra workspace for `engenty.copilot` — one **operator desk** per
user × tenant, shared across all copilot threads and runs.

Declared on the agent as `workspace.preset: "assistant"` in
`modules/engenty-copilot/ai/agents/engenty.copilot/agent.ts`. Apps/ai expands the
preset and attaches a Mastra `Workspace` per run.

## Product contract

| Mount | Access | Storage (tenant-relative) | When |
|-------|--------|---------------------------|------|
| `/home` | rw | `ai/workspace/users/<user-id>/` | Always |
| `/shared` | rw | tenant `ai/workspace/commons/` | Non-confined tenant run |
| `/space` | rw | Space `ai/workspace/commons/` | Space-confined run; replaces `/shared` |
| `/skills` | ro | `ai/skills/` | Always (`managed` + `custom` discovery) |
| `/task` | rw | task checkout prefix | Task-bound only |
| `/project` | rw | work-scope prefix | When containment binding resolves |
| `/data` | rw via module operations | no storage prefix | Resolved Space only |
| `/sandbox` | rw | `ai/sandboxes/session-<threadId>/…` | Sandbox enabled (session lifecycle) |

- **Threads:** transcript-only (`ai.thread` / `ai.thread_message`); no per-thread FS root.
- **Skills discovery:** `/skills/managed`, `/skills/custom` (see `DEFAULT_SKILL_DISCOVERY_PATHS`).
- **Shared context:** a run receives `/shared` or `/space`, never both. These are
  working/context files, not the module-record store.
- **Space Data:** `/data` projects mounted module records. It is never scratch or
  a conversation notebook.
- **Deliverables:** publish user-facing files to Files and authored output to
  artifacts; a workspace path alone is not a handoff.

## Capabilities (current `engenty.copilot` config)

| Feature | Enabled | Notes |
| --- | --- | --- |
| Filesystem mounts | Yes | Assistant preset above |
| Skills discovery | Yes | Auto skill tools when `/skills` is mounted |
| BM25 search | Yes | `search: { bm25: true }` |
| Sandbox | Yes | `lifecycle: "session"`, `requireApproval: true` (EXECUTE_COMMAND HITL); lazy start |
| Vector/hybrid search | No | Not enabled on this agent |

Free-form CLI/code work stays delegated to `engenty.cli` (own sandbox). Copilot
sandbox powers Code Mode (`execute_typescript`) on the personal desk.

## Tools

Mastra **auto-registers** workspace filesystem / skill / BM25 tools when a
`Workspace` is attached. Copilot also carries catalog tools (`engenty_tools_*`),
native frontend tools (suspend/resume), `chatThreadSearch`, `web_search`,
`requestDecision` / `requestFeedback`, artifacts, memory, widgets, etc. — see
`ENGENTY_COPILOT_TOOL_IDS` in `ai/agents/engenty.copilot/tools.ts`.

**Write policy:** mount-level — `/skills` is read-only; `/home` and whichever of
`/shared` or `/space` is present are writable; bound work mounts follow their
containers; `/data` writes invoke module operations and their approval policy;
sandbox commands may require approval.

## Code map

| Piece | Location |
| --- | --- |
| Agent workspace declaration | `modules/engenty-copilot/ai/agents/engenty.copilot/agent.ts` |
| Preset mounts + path resolution | `apps/ai/src/ai/workspace/workspace-presets.ts` |
| Per-run assemble | `apps/ai/src/ai/sessions/agent-workspace-hook.ts` |
| Resolve + attach on run | `apps/ai/src/ai/sessions/session-service.ts` → `resolveWorkspaceForRun` |

> Module helpers in `src/lib/copilot-workspace.ts` still describe an older
> agent-scoped prefix (`ai/workspace/agents/engenty.copilot/users/…`). Runtime
> `/home` for the assistant preset is **`ai/workspace/users/<user-id>/`**.

## Out of scope

- Files UI deep link to the personal desk
- Group-scoped shared copilot workspace
- Per-thread FS directories
