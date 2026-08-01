---
title: "How-to: Agent Hooks"
description: Compose an agent as a function with useModel/useTool/useThreadState instead of a static agent.json — a phased triage example included.
---

# How-to: Agent Hooks

Agent Hooks let you author an agent as a **function** that composes its
capabilities with `useX` calls, instead of a static `agent.json` object. The
function re-renders on every resolution (once per turn for a live run), so a
render can read durable per-thread state and change the agent's model tier,
tools, or skills between turns — the state-machine capability a static config
can't express.

This is additive: `agent.json` remains the right choice for most agents,
especially tenant-editable ones. Reach for a function agent when a **builtin
or module** agent needs conditional composition (phases, feature-gated
tools) that would otherwise mean one sub-agent per branch.

There is no separate hook "language" to learn beyond the API below — a hook
is a plain function that writes onto the render draft, and the render output
**is** a normal `AgentConfig`, validated through the same schema `agent.json`
goes through. See [How to declare a module's AI surface](howto-define-module-ai)
for the surrounding directory convention.

## 1. Write the function

A function agent's body runs **synchronously** and returns its base
instructions as a string. Everything else — model, tools, skills — is
declared with hooks, in any order, including inside `if` branches:

```ts
// modules/invoices/ai/agents/invoices-specialist/agent.ts
import type { AgentFnDescriptor } from "@engenty/ai-core";
import { useRegisteredTool, useSkillHint } from "@engenty/ai-core";
import instructions from "./AGENTS.md"; // files stay the content medium

export const invoicesSpecialistAgent: AgentFnDescriptor = {
  id: "invoices.specialist",
  name: "Invoices Specialist",
  fn: () => {
    useSkillHint("invoice-drafting");
    useRegisteredTool("invoices_list");
    useRegisteredTool("invoices_create_draft");
    return instructions;
  },
};
```

This renders to exactly the `AgentConfig` a hand-written `agent.json` +
`AGENTS.md` pair would have produced — `skillIds: ["invoice-drafting"]`,
`toolIds: [...]`, `instructions` from the markdown file. Nothing downstream
(governance, guardrails, tool-profile filtering, the admin catalog) needs to
know the config came from a function instead of a file.

### Available hooks

| Hook | Writes | Notes |
|---|---|---|
| `useModel(id)` | `modelOverride` | Grant-checked downstream exactly like a row's pin — a render can *request* a model, only tenant governance decides. |
| `usePurpose(p)` | `purpose` | Inherit the tenant's model tier (`chat`, `routing`, `research`, `planning_coding`, `safeguard`). Mutually exclusive with `useModel` — at most one model declaration per render. |
| `useInstruction(md)` | appended after the returned string | For always-on blocks composed from a custom hook; joined with blank lines. |
| `useSkillHint(name)` | `skillIds` | Same semantics as `agent.json`'s `skillIds`: a hint in the prompt. `SKILL.md` content still loads on demand via the workspace skill tools — never inlined here. |
| `useRegisteredTool(id)` | `toolIds` | Attaches a tool the registry already knows how to resolve. |
| `useTool(name, def)` | inline, closures allowed | For tools that need to close over local render state (see the phase machine below). Rides a private channel into the assembler's tool merge — never serialized. |
| `useSubagent(id, alias?)` | `subAgents` | Same as `agent.json`'s `subAgents`. |
| `useWorkspace(cfg)` | `workspace` | Filesystem/skills/sandbox request, schema-validated at render. |
| `useGuardrails(cfg)` | `guardrails` | Opt into the Mastra guardrail processors. |
| `useLimits(cfg)` | `limits` | Per-agent iteration cap / budget. |
| `useThreadState(key, initial)` | reads a durable snapshot; returns `[value, setter]` | See below — the hook that makes phase machines possible. |

### Custom hooks

A custom hook is a plain function that calls other hooks — there is no
registration step:

```ts
function useCompanyAgent(skills: string[]) {
  useGuardrails({ enabled: true });
  useInstruction(companyVoiceMd);
  for (const skill of skills) {
    useSkillHint(skill);
  }
}

export const offersAgent: AgentFnDescriptor = {
  id: "offers.specialist",
  name: "Offers Specialist",
  fn: () => {
    useCompanyAgent(["offer-pricing"]);
    useRegisteredTool("offers_list");
    return offersInstructions;
  },
};
```

## 2. Durable per-thread state and phase machines

`useThreadState(key, initial)` reads a value from the thread's persisted
`agent_state` and returns a setter. The render value is a **snapshot** — the
setter throws if called during render; call it from a tool's `execute`
callback instead. A transition made in turn N is visible starting turn N+1's
render — the same turn boundary that already re-assembles the agent.

The recommended pattern is `useMachine` — an advisory phase machine built
entirely from the hooks above (`packages/ai-core/src/hooks/machine.ts`).
Tools can stay mounted for the agent's whole life and refuse out-of-phase
calls via `guardedTool`, or a phase can mount its own tools only while
active, as in this example:

```ts
// apps/ai/src/ai/agents/function-agents/issue-triage-demo.ts
import type { AgentFnDescriptor } from "@engenty/ai-core";
import { useMachine, usePurpose, useSkillHint } from "@engenty/ai-core";

export const issueTriageDemoAgent: AgentFnDescriptor = {
  id: "engenty.issue-triage-demo",
  name: "Issue Triage (demo)",
  fn: () => {
    const machine = useMachine({
      name: "step",
      phases: ["reproduce", "diagnose", "report"] as const,
      initial: "reproduce",
    });

    if (machine.phase === "reproduce") {
      useSkillHint("repro-checklist");
      machine.advance(
        "diagnose",
        "Call once the issue reproduces reliably and the repro steps are written down."
      );
    }
    if (machine.phase === "diagnose") {
      usePurpose("planning_coding"); // heavier tier for this phase only
      useSkillHint("debugging-guide");
      machine.advance(
        "report",
        "Call once the root cause is identified with evidence."
      );
    }

    return "Work strictly within your current phase; call the transition tool once its exit condition is met.";
  },
};
```

Each render mounts exactly one transition tool — `enter_diagnose` while in
`reproduce`, `enter_report` while in `diagnose`, none once `report` is
reached. Calling `machine.advance(...)` internally calls `useTool(...)` with
a closure that persists the phase and returns a confirmation string as the
tool result; `useMachine` also emits a `useInstruction` block announcing the
workflow and current phase.

The full working example, including the assertion that a transition
actually changes `purpose`/`skillIds`/`toolIds` on the very next render, is
in [`apps/ai/src/__tests__/function-agents-builtin.test.ts`](../../../apps/ai/src/__tests__/function-agents-builtin.test.ts).

### Guarding instead of conditionally mounting

If a tool's *existence* is fine to keep constant but its *availability*
should vary by phase, wrap it with `guardedTool` instead of gating the
`useTool`/`useRegisteredTool` call:

```ts
import { guardedTool } from "@engenty/ai-core";

useTool("send_reply", guardedTool(machine.check("committing"), sendReplyTool));
```

`check(phase)` returns a function that yields `null` (proceed) or a refusal
string (returned as the tool result instead of running it). Prefer this over
conditional mounting when you want the model to see the tool exists but
learn from the refusal message why it can't run yet — useful once a workflow
has more than a couple of tools per phase.

## 3. Register the agent

**Builtin agents** are collected in
[`apps/ai/src/ai/agents/function-agents.ts`](../../../apps/ai/src/ai/agents/function-agents.ts):

```ts
import type { AgentFnDescriptor } from "@engenty/ai-core";
import { invoicesSpecialistAgent } from "../../../ai/agents/invoices-specialist/agent.js";

export const builtinFunctionAgents: AgentFnDescriptor[] = [
  invoicesSpecialistAgent,
];
```

**Module agents** pass function agents through `defineModuleAi`'s `agentFns`
option, alongside the existing `agent.json` scan:

```ts
// modules/invoices/ai/registrar.ts
import { defineModuleAi } from "@engenty/ai-core";
import { invoicesSpecialistAgent } from "./agents/invoices-specialist/agent.js";

const moduleAi = defineModuleAi({
  dir: import.meta.url,
  moduleId: "invoices",
  agentFns: [invoicesSpecialistAgent],
});
```

If a scanned `agents/<id>/agent.json` exists with the same id as a function
in `agentFns`, the function wins — the json directory can stay as
documentation, or be removed. There's no dual-registration error; this is
the intended migration path for turning an existing data agent into a
function agent.

## Precedence and governance

Resolution order is unchanged by this feature: **tenant DB row → function
agent → module `agent.json` → builtin**. A tenant admin editing an agent in
the settings UI always overrides a function agent of the same id — function
agents are a code-authoring convenience for builtin/module agents, not a
replacement for tenant-editable configuration.

Everything a rendered config touches downstream behaves exactly like a
row-authored one: `useModel`'s pin is grant-checked by
`resolveAgentModelId` before use, `useGuardrails` opts into the same Mastra
guardrail processors, `useLimits` is enforced the same way. Rendering never
bypasses governance — it only changes where the config comes from.

## Constraints worth knowing

- **Renders must be synchronous.** Do async work (fetching data, resolving
  IDs) before constructing the `AgentFnDescriptor`, not inside `fn`.
- **Hooks only work inside a render.** Calling one from a tool's `execute`
  callback, an event handler, or module scope throws immediately with a
  clear error — the same discipline as React hooks.
- **`useModel`/`usePurpose` are mutually exclusive and single-use per
  render** — declaring a model twice throws rather than silently picking
  the last one.
- **`useThreadState` keys must be unique per render** but may be
  conditional — a key that's only read in one phase is fine; declaring the
  same key twice in one render throws.
- Catalog listings and delegate lookups render **bare** (no thread context):
  a function agent's base face, with default state. This is a useful
  sanity check — an agent that throws on a bare render has a bug in its
  default-state path.
