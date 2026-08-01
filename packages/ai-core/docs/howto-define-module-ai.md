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
  actions/<action-id>/ACTION.md
  routines/<routine-id>/ROUTINE.md
  tools/<kebab>/<kebab>-tool.ts     # Mastra tool builders (wired via options.tools)
```

Every directory is optional — absent directories produce empty lists.

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
  (`workspace`, `guardrails`, `subAgents`, `backgroundTasks`).
  **agent.json must not hardcode `model`** — supply it via an override.
- **skills/** — `loadSkillDefinitionsFromDirectory` for catalog seeding plus a
  raw-markdown map for the dynamic seed channel.
- **actions/** — `loadActionDefinitionsFromDirectory`. Action `agent_id` must
  reference an agent of this module unless `allowCrossModuleActionAgents`.
- **routines/** — `loadRoutineDefinitionsFromDirectory` (Phase 4).

## Options

| Option | Use |
|---|---|
| `agents` | `AgentConfigOverride[]` merged by id onto scanned configs — model (via `resolveChatModelId`), workspace, instructions. An override id with no scanned dir must be a full config. |
| `agentFns` | `AgentFnDescriptor[]` — hook-composed agents (conventionally `agents/<id>/agent.ts`), passed through to `dynamicCapability().agentFns`. A function replaces a scanned `agent.json` of the same id. See [How-to: Agent Hooks](howto-agent-hooks). |
| `agentDefinitions` | Code-level `AgentDefinition[]` (dynamic `build_system_prompt`, chat routing) → `AiRegistration.agents` verbatim. |
| `tools` | Tool id → Mastra tool builder, → `dynamicCapability().tools`. |
| `skills` / `skillMarkdown` | Escape hatch replacing the SKILL.md scan (chatbot dynamic skills). |
| `instructionDocuments`, `triggers`, `schemaReferences` | Passed through. |

## Validation (throws at build time)

Bad agent dir id format (`<module>.<role>`), duplicate ids, hardcoded model in
agent.json, missing AGENTS.md/instructions, action `agent_id` outside the
module (without the explicit flag).

Node-only (`fs`) — import from `@engenty/ai-core`, never from `/browser`.
`pnpm ai:check` enforces the same conventions repo-wide.
