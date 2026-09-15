---
title: "How-to: Agent Workspaces"
description: Step-by-step guide to adding a Mastra workspace to an agent — presets, custom mounts, sandbox, and search.
---

# How-to: Agent Workspaces

This guide walks through adding a Mastra workspace to a new or existing agent.
Read the [Spaces runtime contract](../../../docs/agent/spaces-runtime.md) first.

A workspace is the named file/context mounts resolved for one run. It is not a
Space, queue, task database, or module-record store. `/data` is a separate
projection of mounted module records. User-facing documents belong in Files or
artifacts; do not treat a working path as a delivered result.

## 1. Pick a preset

Start with the right archetype:

| You want… | Use |
|-----------|-----|
| Personal assistant with a user-scoped `/home` (like `engenty.copilot`) | `preset: "assistant"` |
| Staff specialist with an agent-scoped `/home` | `preset: "staff"` |
| Code execution without a personal `/home` | `preset: "code_execution"` |
| Non-standard mount layout | `preset: "custom"` + explicit `mounts` |

Preset declarations are not promises that every conditional mount exists. The
resolved run receives:

| Preset | Mounts |
|---|---|
| `assistant` | `/home`, `/skills`; `/shared` or confined `/space`; `/data` only with a resolved Space; `/task`, `/project` only when bound |
| `staff` | Same, but `/home` belongs to the staff agent rather than the user |
| `code_execution` | `/skills`, `/sandbox`; `/shared` or `/space`; conditional `/data`, `/task`, `/project`; no `/home` |
| `custom` | Only the declared mounts whose required bindings resolve |

Use only mounts present in the run. In particular, never tell a confined run to
write `/shared`, or an unbound chat to use `/task`.

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

A declared `run` lifecycle becomes the **space computer** when the run resolves a
Space — one long-lived container shared by that Space's agents, instead of a
container per run. `task` and `session` declarations keep their own containers.
The declared `network` (`none` by default) is likewise overridden on the machine
by the Space's own setting. See
[Agent computers](../../../docs/content/dev/agent-computers.md).

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

| source | Meaning |
|--------|---------|
| `commons` (scope `tenant`) | tenant `/shared` context |
| `commons` (scope `space`) | confined `/space` context |
| `home` (scope `user`) | user-personal `/home` |
| `home` (scope `agent`) | staff-agent `/home` |
| `skills` | read-only `/skills` library |
| `checkout` (scope `task`) | bound `/task` files |
| `routine` / `project` | containment files, only when those bindings resolve |
| `data` | `/data` module records; not a file-storage prefix |

Storage-backed task, routine, project, Space, and sandbox mounts are rooted in the
resolved Space. `/home` and `/skills` remain tenant-rooted. This is why callers
must use mount names rather than constructing storage keys.

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

Preferred skills must belong to the agent’s own module (the `SKILL.md` next to
that agent). A skill from another module becomes visible when that module is
**mounted** on the Space or the skill is **explicitly mounted** — do not list it
on `skillIds` / `useSkillHint` as a backdoor. In a Space-bound run, skill
discovery is the union of those three sources; unmounted-module skills stay
hidden even though tenant storage is shared.

## Checklist

- [ ] `workspace.preset` set (or `mounts` declared for `custom`)
- [ ] `sandbox.requireApproval: true` whenever sandbox is enabled
- [ ] Env vars present if `vector: true` (`ENGENTY_WORKSPACE_VECTOR_DB_URL`, `AI_GATEWAY_API_KEY`)
- [ ] `skillIds` lists only skills this module owns (Space mounts cover the rest)
- [ ] Module skills declared in `ai/skills/<name>/SKILL.md` (seeded automatically at startup)

## Related docs

- [Spaces runtime contract](../../../docs/agent/spaces-runtime.md)
- [Agent computers](../../../docs/content/dev/agent-computers.md) — what the
  declared sandbox actually becomes at run time: lifecycle resolution, the space
  computer, network tiers, resource ceilings, and the mounts the container sees
- [Who drives what](../../../docs/agent/who-drives.md)
