---
title: "How-to: Agent Workspaces"
description: Step-by-step guide to adding a Mastra workspace to an agent — presets, custom mounts, sandbox, and search.
---

# How-to: Agent Workspaces

This guide walks through adding a Mastra workspace to a new or existing agent. Read the [Agent Workspaces architecture doc](../../../docs/content/dev/ai-agents/workspaces.md) first for a conceptual overview.

## 1. Pick a preset

Start with the right archetype:

| You want… | Use |
|-----------|-----|
| Personal assistant per user (like `engenty.copilot`) | `preset: "assistant"` |
| Company-shared specialist agent (like `engenty.tools`) | `preset: "staff"` |
| Non-standard mount layout | `preset: "custom"` + explicit `mounts` |

## 2. Add `workspace` to `AgentConfig`

In your agent definition (builtin: `apps/ai/src/ai/workspace/workspace-agent-registry.ts`; module: `modules/<name>/ai/registrar.ts`):

```ts
import type { AgentConfig } from "@engenty/ai-core";

export const myAgent: AgentConfig = {
  id: "my_module_specialist",
  name: "Specialist",
  instructions: "You help users with ...",
  model: "openai/gpt-4.1-mini",
  workspace: {
    preset: "staff",
  },
};
```

The harness hook (`apps/ai/src/ai/sessions/agent-workspace-hook.ts`) automatically builds and tears down the workspace on every run.

## 3. Enable sandbox (optional)

Give the agent shell execution via Mastra's sandbox. Always set `requireApproval: true` for user-facing agents — it gates `EXECUTE_COMMAND` through a HITL interrupt.

```ts
workspace: {
  preset: "staff",
  sandbox: {
    enabled: true,
    requireApproval: true,
  },
},
```

Only remove `requireApproval` for fully-trusted internal automation agents with no user interaction.

## 4. Enable search (optional)

BM25 keyword search over workspace files is on by default when the `/skills` mount is present. Add vector (semantic) search for hybrid retrieval:

```ts
workspace: {
  preset: "assistant",
  search: {
    bm25: true,
    vector: true,   // activates only when env vars are set (see below)
  },
},
```

**Required env vars for vector search:**

```
ENGENTY_WORKSPACE_VECTOR_DB_URL=postgres://...   # or SUPABASE_DB_URL
AI_GATEWAY_API_KEY=...
```

When the env is not configured, `vector: true` is silently ignored (BM25-only). No code changes needed when you later add the env vars — vector search activates automatically.

## 5. Custom mounts

If neither preset fits, use `preset: "custom"` and declare the mount table explicitly:

```ts
workspace: {
  preset: "custom",
  mounts: [
    { path: "/home", scope: "agent", source: "home", access: "rw" },
    { path: "/shared", scope: "tenant", source: "commons", access: "rw" },
    { path: "/skills", scope: "tenant", source: "skills", access: "ro" },
  ],
},
```

Each mount's `source` maps to a file-storage prefix:

| source | path in file storage (under `tenants/<tid>/`) |
|--------|-----------------------------------------------|
| `commons` (scope `tenant`) | `ai/workspace/commons/` |
| `home` (scope `user`) | `ai/workspace/users/<uid>/` |
| `home` (scope `agent`) | `ai/workspace/agents/<agentId>/` |
| `skills` | `ai/skills/` |
| `checkout` (scope `task`) | `ai/workspace/tasks/<taskId>/` |

## 6. Override skill discovery paths

By default, skill discovery scans `/skills/managed` and `/skills/custom` inside the workspace. Override if your agent needs a non-standard layout:

```ts
workspace: {
  preset: "staff",
  skills: {
    discoveryPaths: ["/skills/managed", "/skills/custom", "/home/personal-skills"],
  },
},
```

## 7. Reference skills from the agent

List skill names (not paths) in `skillIds` — these become "preferred skills" hints in the agent's system prompt, nudging it to load and follow those skills from the workspace:

```ts
const myAgent: AgentConfig = {
  // ...
  skillIds: ["web-research", "report-writing"],
  workspace: { preset: "staff" },
};
```

The actual `SKILL.md` content is loaded on demand by Mastra Workspace tools, not inlined on every call.

## Checklist

- [ ] `workspace.preset` set (or `mounts` declared for `custom`)
- [ ] `sandbox.requireApproval: true` whenever sandbox is enabled
- [ ] Env vars present if `vector: true` (`ENGENTY_WORKSPACE_VECTOR_DB_URL`, `AI_GATEWAY_API_KEY`)
- [ ] `skillIds` lists the skills the agent should prefer
- [ ] Module skills declared in `ai/skills/<name>/SKILL.md` (seeded automatically at startup)

## Related docs

- [Agent Workspaces architecture](../../../docs/content/dev/ai-agents/workspaces.md)
- [Skills](../../../docs/content/dev/ai-agents/skills.md)
- [HITL Artifacts](../../../docs/content/dev/ai-agents/hitl-artifacts.md)
