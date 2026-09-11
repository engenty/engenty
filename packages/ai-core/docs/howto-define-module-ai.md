---
title: "How to declare a module's AI surface with defineModuleAi"
description: One call against one directory convention replaces hand-rolled registrar boilerplate.
---

# How to declare a module's AI surface with `defineModuleAi`

One call against one directory convention replaces the hand-rolled registrar
boilerplate (skill markdown loaders, manifest plumbing, capability assembly).

## Directory convention

```
modules/<name>/ai/
  registrar.ts                      # defineModuleAi() call — nothing else
  agents/<agent-id>/agent.json      # + AGENTS.md (identity/rules), optional SOUL.md
  agents/<agent-id>/agent.ts        # OR a hook-composed agent (passed via options.agentFns)
  skills/<skill-name>/SKILL.md
  workflows/<id>.workflow.json      # Mastra DynamicWorkflowGraph + metadata
  tools/<kebab>/<kebab>-tool.ts     # Mastra tool builders (wired via options.tools)
```

Every directory is optional — absent directories produce empty lists.

## Three skill authoring roots

Playbooks are authored in three places and seeded into one flat tenant catalog
(`tenants/<tid>/ai/skills/managed/<name>/SKILL.md` plus optional siblings such
as `references/` and `canvas-fonts/`). `name` is globally unique — seed throws
on a collision.

| Root | Path | Seed `source` | Visible to `skill_search` when |
|---|---|---|---|
| Runtime | `apps/ai/ai/skills/<name>/` | `builtin` | Always on a resolved run (keep this set small). |
| Product | `modules/<id>/ai/skills/<name>/` | `<moduleId>` | That module is Space-mounted. |
| Library | `packages/ai-skills/ai/skills/<category>/<name>/` | `library` | Explicit Space skill mount or a category pack (`PUT /api/spaces/:id/skill-packs/:category`). |

Do not put playbooks in `@engenty/ai-core`. Do not inline skill bodies or a
name+description index into AGENTS.md. Agents discover with `skill_search`, then
load with `skill`. A pack is a batch of `skill` mounts — not a fifth resource
type. `syncSpaceSkills` still auto-mounts **module** skills only.

Adapted library skills carry `license`, `author`, and `metadata.engenty.origin`
in frontmatter; pack legal files live in `packages/ai-skills/LICENSE` and
`NOTICE.md`.

## Minimal registrar

```ts
import { defineModuleAi } from "@engenty/ai-core";

const moduleAi = defineModuleAi({
  dir: import.meta.url, // or an absolute ai/ dir path
  moduleId: "offers",
});

export const offersAiRegistration = () => moduleAi.aiRegistration();
export const offersDynamicAiCapability = () => moduleAi.dynamicCapability();
```

## What gets scanned

- **agents/** — every `<agent-id>/agent.json` (manifest schema) becomes an
  `AgentConfig`. `instructions` come from the sibling `AGENTS.md` (+ `SOUL.md`
  appended). Extra `AgentConfig` fields in agent.json pass through
  (`agentScope`, `workspace`, `guardrails`, `subAgents`, `backgroundTasks`).
  Set `agentScope: "personal"` for a user-owned assistant or `"shared"` for a
  company agent whose shared state belongs to its active space.
  **agent.json must not hardcode `model`** — supply it via an override.
- **skills/** — `loadSkillDefinitionsFromDirectory` for catalog seeding plus a
  raw-markdown map for the dynamic seed channel.
- **workflows/** — `loadModuleWorkflowsFromDirectory` (`*.workflow.json`). Workflow `owner_agent_id` must
  reference an agent of this module unless `allowCrossModuleActionAgents`.
- **routines** — not a scanned directory. A module routine is declared on the
  owning agent's `agent.json` as `triggers: [{ id, workflow, kind, cron, … }]`,
  or passed as `triggerDeclarations` when the owning agent lives in another
  module (Memory's weekly consolidate names `engenty.copilot` that way). There
  is no `ROUTINE.md`.

## Options

| Option | Use |
|---|---|
| `agents` | `AgentConfigOverride[]` merged by id onto scanned configs — model (via `resolveChatModelId`), workspace, instructions. An override id with no scanned dir must be a full config. |
| `agentFns` | `AgentFnDescriptor[]` — hook-composed agents (conventionally `agents/<id>/agent.ts`), passed through to `dynamicCapability().agentFns`. A function replaces a scanned `agent.json` of the same id. See [How-to: Agent Hooks](howto-agent-hooks). |
| `agentDefinitions` | Code-level `AgentDefinition[]` (dynamic `build_system_prompt`, chat routing) → `AiRegistration.agents` verbatim. |
| `tools` | Tool id → Mastra tool builder, → `dynamicCapability().tools`. |
| `skills` / `skillMarkdown` | Escape hatch replacing the SKILL.md scan (chatbot dynamic skills). |
| `instructionDocuments`, `triggers`, `schemaReferences` | Passed through. `triggers` here are legacy copilot chat triggers (`message_copilot` / button / shortcut), not routines. |
| `triggerDeclarations` | Extra module routines whose owning agent is **not** in this module's `agents/` tree. Appended after the `agent.json` `triggers` scan. |

## Validation (throws at build time)

Bad agent dir id format (`<module>.<role>`), duplicate ids, hardcoded model in
agent.json, missing AGENTS.md/instructions, action `agent_id` outside the
module (without the explicit flag).

Node-only (`fs`) — import from `@engenty/ai-core`, never from `/browser`.
`pnpm ai:check` enforces the same conventions repo-wide, including Space
authoring rules below.

## Space-aware operations and skills

Tenant is the organization and RLS boundary. **Active Space** is the run
location: mounted apps, agents, connections, skills, and the default home for
space-owned records. Declaring `spacePolicy` on each module operation is how
core enforces that — prompt text is not enough. Canonical runtime wording lives
in [Spaces runtime contract](../../../docs/agent/spaces-runtime.md); do not copy
it into every skill.

### Choose `spacePolicy`

Mounting an app in a Space is **availability**. `spacePolicy` is **row
membership**. They are independent: a tenant-shared book is still tenant-wide
after the app is mounted, and an unmounted app can exist in Engenty without
being part of this Space.

| `kind` | When to use | Row rule |
|---|---|---|
| `space_owned` | Records that live in one Space (projects, tasks, Space files) | List/create default to `current_space`. Direct ids must belong to it. |
| `tenant_shared` | One tenant library (contacts, company profile, team directory) | Never invent a `space_id`. Mount grants access to the shared book. |
| `account_mounted` | Per-connection accounts (inbox, connectors) | Only accounts mounted in this Space. |
| `user_owned` | Owner-visible personal data (memory, secrets) | Keep owner visibility; still require the app/account mount where applicable. |
| `platform` | Intentionally outside tenant record data | No Space row binding. |

Put `spacePolicy` on every Space-placed operation (`placement: "space"` in
`engenty.plugin.json`, which is also the default). Missing policy is a CI
failure (`pnpm ai:check`), not an implied `tenant_shared`. Synthesized search
operations take the same field on search-index / retrieval registration.

Optional `record_scope` frontmatter on `SKILL.md` / `AGENTS.md` must match the
declared kind when present. Do not grep prose for “tenant” vs “Space”.

### Examples

**Space-owned** (collection list/create — core injects `auth.spaceId` into
`space_id`; the schema must still accept it):

```ts
api.registerOperation({
  operationId: "projects_list",
  spacePolicy: { kind: "space_owned" },
  inputSchema: z.object({
    space_id: z.string().uuid().optional(),
    // …
  }),
  // …
});
```

Get/update/delete derive Space from the record and refuse a cross-Space id:

```ts
spacePolicy: {
  kind: "space_owned",
  record: { moduleId: "projects", idInputKey: "id" },
}
```

**Tenant-shared** (no `space_id` on the book):

```ts
api.registerOperation({
  operationId: "contacts_list",
  spacePolicy: { kind: "tenant_shared" },
  // input has filters, never space_id
});
```

**Account-mounted** (named connection, or catalog list of mounted accounts):

```ts
api.registerOperation({
  operationId: "connections_get",
  spacePolicy: {
    kind: "account_mounted",
    connectionInputKey: "connection_id",
  },
});
```

### Catalog vs execute evidence

`engenty_tools_modules`, `engenty_tools_search`, and `engenty_tools_discover`
return **operation contracts**, not app records. Tool descriptions must not
call that catalog output “data”. State names, IDs, counts, or statuses only
after `engenty_tool_execute` returns `ok: true` with readable `data`.

### Skills visible in a Space

A Space-bound run sees the union of: skills owned by **mounted modules**,
skills **explicitly mounted** on the Space, and the active agent’s
**preferred** skills (`agent.json` `skills` / `useSkillHint`). Do not prefer a
skill that belongs to another module — mount it on the Space instead.
Installation stays tenant-wide; visibility is filtered.

### Canonical `/s/` navigation

Inside a Space prefer `/s/<space_key>/…` (module segment from the running
route mirror, not always `moduleId`). Let the `navigate` frontend tool resolve
the real table. See [Frontend tools](../../ag-ui-bridge/docs/frontend-tools.md).

