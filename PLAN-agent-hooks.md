# PLAN: Agent Hooks — a `useX` authoring layer over `AgentConfig`

Branch: `feat/agent-hooks` (worktree `engenty-pro-agent-hooks`, cut from `main` @ v0.1.82)
Status: **scoped — not started**
References: [Flue 2.0 announcement](https://flueframework.com/blog/flue-2/) · [withastro/flue source](https://github.com/withastro/flue) (runtime hooks read at `packages/runtime/src/hooks/`, ~1,855 LOC)

## Why

Flue 2.0 (Astro team) ships a React-style hooks API for composing agents:
agent = a synchronous function; `useModel` / `useTool` / `useSkill` /
`usePersistentState` compose capabilities; the function re-renders per turn so
persistent state can drive per-phase model/tool/skill selection.

We already have the *runtime* half of this: `assembleDynamicAgent` re-reads
`AgentConfig` from the registry on **every turn** (`conversation-run.ts:225`),
so dynamism-by-data exists. What we lack:

1. **DX**: code-authored agents today are `agent.json` + `AgentConfigOverride`
   merging — override, not composition. No reusable authoring unit
   (`useCompanyAgent()` bundling guardrails + voice + skills).
2. **Thread-scoped state driving assembly**: nothing feeds per-thread state
   into the assembler, so "same agent, phase 2, different toolset" is
   inexpressible without a sub-agent per phase.

This plan adds both as a **new producer of `AgentConfig`** — nothing below
the assembler changes.

## Verified facts from the Flue source (not the blog)

Read from a clone of `withastro/flue`, `packages/runtime/src/`:

- `hooks/frame.ts`: module-global `currentFrame` slot; renders are strictly
  synchronous ("Same discipline as Preact's `currentComponent`"); hooks throw
  outside a render; re-entrant renders throw; async agent fns throw.
  **No fiber, no hook-order tracking anywhere.**
- State (`use-persistent-state.ts`) is **string-keyed**, so conditional hooks
  are legal (documented). Duplicate state names in one render throw.
- **Setters throw during render** — a render is a pure read. Writes are only
  legal from tool `run` callbacks, buffered in a `HookStateBuffer` (overlay
  over snapshot, deep-equal no-ops dropped), and drained **atomically with
  the tool batch's persistence** — rolled back if the batch is.
- Re-render happens per model-call turn, but `useModel` is
  **submission-scoped**: a changed model takes effect on the *next* message.
  Even Flue does not switch models mid-run.
- Their frame→config mapping (~15 lines) exists mostly to feed a *resource
  fingerprint* used to **narrate tool/skill deltas to the model** between
  mid-run re-renders. Our toolset is fixed within a run, so we don't need any
  of that machinery (~1/3 of their hook LOC).
- Their flagship state-machine example (`examples/support-desk`) does **not**
  conditionally mount tools — it mounts everything and *guards* execution
  (`guarded(check, tool)` refuses out-of-phase calls). The machine is
  "advisory, not structural". Conditional mounting is legal but their own
  practice prefers guards.
- Flue is file-based where we are: `useSkill` takes a **`SKILL.md` import**
  (Vite packages the dir) or a runtime-discovered `.agents/skills/` workspace
  skill; always-on content is a plain markdown import passed to
  `useInstruction()`. Files = content, hooks = wiring. No collision.

## Design decisions

### D1 — No IR: the render draft IS `Partial<AgentConfig>`

Every hook writes AgentConfig's own field names onto a mutable draft
(`useModel` → `draft.modelOverride`, `useSkillHint` → `draft.skillIds.push`).
The render output goes through **`agentConfigSchema.parse`** — the same gate
`agent.json` passes — then into `assembleDynamicAgent` unchanged. Zero
mapping/translation code; this is the leanness guarantee. (Flue's small
mapping step exists for delta narration we don't need — see facts above.)

### D2 — Synchronous render, module-local frame

Single-threaded JS + no `await` inside the render window = a module-local
`let frame` is race-free without `AsyncLocalStorage`. Enforced: agent fn
returning a thenable throws; hooks outside a render throw with a clear
message. Async work (state load, future MCP discovery) happens in the
provider *around* the sync render.

### D3 — String-keyed thread state; setters throw during render; buffered writes

`useThreadState(key, initial)` (name deliberately honest about scope: state
is per conversation thread, persisted at `agent_sessions.metadata.agent_state`).
- Read: snapshot loaded by the provider before render.
- Write: only from tool `execute` callbacks (setter throws inside render,
  Flue semantics). Writes buffer in an overlay store and **flush with the
  turn's session persistence**, composing with park/resume + approvals.
- Conditional `useThreadState` calls are fine (keyed storage); duplicate keys
  in one render throw.

### D4 — Inline tools ride the existing `extraTools` merge via a symbol channel

Closure tools (`useTool("enter_diagnose", { execute: () => setPhase(...) })`)
can't resolve through `registry.getTool(id)` (per-render, per-thread). The
rendered tools record hangs off the returned config under a
`Symbol("engenty.renderedTools")` property — invisible to zod/JSON, so
`AgentConfig` stays serializable — and the assembler folds it into
`agentTools` exactly like `options.extraTools` (~6 lines, the only assembler
change). Name clashes with config tools: rendered tools win (same rule as
extraTools).

### D5 — One optional context parameter on the registry

`getAgentConfig(id, ctx?: AgentRenderContext)` where
`ctx = { threadId, scope }`. Existing providers ignore it; existing call
sites compile unchanged. `assembleDynamicAgent` threads it from its options
(conversation-run already holds both). Context-free calls (`listAgentConfigs`
catalogs, delegate lookups) render with **empty state** — the agent's base
face — which doubles as a free "renders under default state" purity check.

### D6 — Governance is untouched by construction

The rendered config flows through the exact same downstream: `useModel`
writes `modelOverride`, which `resolveAgentModelId` grant-checks (the
ungoverned-pin bug class is already fixed there — rendered pins must NOT
bypass it, and structurally cannot, since the render happens before
resolution). Guardrails, limits, tool profiles, approvals: all operate on the
rendered config as if it were a row.

### D7 — Two authoring tiers; file-based agents do not collide

- **Tenant/DB agents**: stay `agent.json`-shaped rows — admin-UI-editable,
  `agent_propose`-governable, no deploy. Unchanged.
- **Module/builtin agents**: may graduate to functions. In the module tree,
  `agent.ts` becomes an *alternative* to `agent.json` in an agent directory
  (scan prefers the function). All content files keep their roles:
  `AGENTS.md`/`SOUL.md` imported and returned, `SKILL.md` stays on-demand via
  workspace skill tools (`skillIds` remain hints), `ACTION.md`/`ROUTINE.md`
  unchanged. Precedent: `AgentDefinition.build_system_prompt` is already a
  code-authored dynamic path beside the file tree.
- V1 is **builtin-only** (one consumer, prove the shape); the module
  `agent.ts` channel is Phase 4.

### D8 — Recommended pattern: advisory phases + guarded tools

Follow Flue's own practice, not their blog: prefer always-mounted tools with
phase guards (refusal messages) + per-phase instructions. Conditional
mounting stays legal (safe for us between turns — toolset is fixed within a
run) and is the right tool for model-tier switches (`usePurpose` per phase).

## Non-goals (v1)

- No within-turn re-render / mid-run capability swap (Flue doesn't switch
  models mid-run either; our equivalent = abort + park/resume, separate phase
  if ever needed).
- No lifecycle hooks (`useAgentStart`…) — the run loop has its own hook
  points (`agent-workspace-hook`, `task-workspace-hook`); a second lifecycle
  system = real mapping code.
- No `useMemory` / `useGuardrailModel` — memory attachment and safeguard
  resolution are harness/tenant concerns; hooks must not bypass governance.
- No resource-delta narration, no structure fingerprint (needed only for
  mid-run re-render).
- No tenant-authored function agents.

## Hook inventory (v1)

| Hook | Writes | Notes |
|---|---|---|
| `useModel(id)` | `draft.modelOverride` | grant-checked downstream |
| `usePurpose(p)` | `draft.purpose` | tenant tier inheritance |
| `useInstruction(md)` | appended, joined `\n\n` after the returned string | Flue's composition order |
| `useSkillHint(name)` | `draft.skillIds.push` | SKILL.md stays on-demand |
| `useRegisteredTool(id)` | `draft.toolIds.push` | registry-resolved |
| `useTool(name, def)` | frame.tools (symbol channel → extraTools merge) | closures allowed |
| `useSubagent(id, alias?)` | `draft.subAgents.push` | |
| `useWorkspace(cfg)` | `draft.workspace` | schema-validated at parse |
| `useGuardrails(cfg)` | `draft.guardrails` | |
| `useLimits(cfg)` | `draft.limits` | |
| `useThreadState(key, initial)` | reads snapshot; setter → write buffer | D3 |

Custom hooks = plain functions calling these; ambient frame makes
composition free (no registration, no infrastructure).

## Phases

### Phase 1 — hooks core in `packages/ai-core` (~170 LOC + tests)

New `packages/ai-core/src/hooks/`:
- `frame.ts` (~50): `RenderFrame` (draft + state snapshot + write buffer +
  tools record), module-local slot, `requireRenderFrame(hookName)` with the
  outside-render error, `renderAgentFn(fn, ctx) → AgentConfig` (sync guard,
  thenable check, `agentConfigSchema.parse`, symbol-attach tools,
  re-entrancy throw).
- `hooks.ts` (~110): the table above. Duplicate `useThreadState` keys throw;
  duplicate `useTool` names throw; `useModel` twice in one render throws
  (Flue: exactly one).
- `state-buffer.ts` (~40): overlay store, deep-equal no-op drop, `drain()`.
- `types.ts` (~25): `AgentFn`, `AgentRenderContext`, symbol export.
- Export from main entry + `browser.ts` exclusion (fs-free, but keep parity
  with existing export discipline).

Tests: render purity (empty-state render), outside-render throw, async-fn
throw, setter-during-render throw, conditional state keys, custom-hook
composition, schema-parse failure surfaces the zod error with agent id.

### Phase 2 — provider + wiring in `apps/ai` (~120 LOC + tests)

- `registry/function-provider.ts` (~70): `FunctionAgentProvider implements
  AiRegistryProvider`, `providerId: "function"`; holds `Map<string, AgentFn>`;
  `getAgentConfig(id, ctx?)`: load `metadata.agent_state` snapshot via
  `AgentSessionStore` when ctx present (else `{}`), sync render, return
  config. `getTool` → undefined (inline tools ride the symbol channel).
  `listAgentConfigs` renders all with empty state.
- Registry types: optional `ctx` param on `AiRegistry.getAgentConfig` +
  composite pass-through (~10).
- `assemble-dynamic-agent.ts`: symbol-channel merge into `agentTools`
  (~6) + thread `renderContext` through options (~10).
- `conversation-run.ts` / `delegate-run.ts`: pass
  `{ threadId, scope }` as renderContext (~6). Sub-agent assembly renders
  **stateless** (Flue rejects root-scoped hooks in subagent frames; we render
  delegates with empty state — same effect, no extra code).
- State flush: drain the write buffer into the session-metadata patch on the
  same persistence path the run already uses
  (`updateSessionForUser`) — atomic with turn persistence, park/resume-safe.

Tests: provider ahead of ModuleProvider in the composite resolves function
agents; state snapshot round-trip (write in tool → next render reads it);
grant-check still filters a rendered `modelOverride` (regression for the
ungoverned-pin class); catalog listing shows base face.

### Phase 3 — proof: first converted agent + phase machine (~100 LOC)

- Convert **one builtin agent** to a function (candidate: a low-risk internal
  one — decide at implementation; `engenty.tools` or a test-only builtin) with
  `AGENTS.md` import + `useSkillHint` + `useRegisteredTool`.
- `useMachine(name, phases, initial)` custom hook (advisory phases +
  transition tools + per-phase instructions, support-desk pattern) +
  `guardedTool(check, def)` wrapper — shipped as exports next to the hooks so
  modules get the pattern for free.
- A demo phase agent (reproduce → diagnose → report) wired into dev, driving:
  per-phase `usePurpose` switch (verify next-run model change), transition
  tool advancing state (verify metadata write + next-turn render), refusal
  guard (verify out-of-phase tool refuses).
- E2E through the copilot chat (worktree preview flow — see memory gotchas:
  dev slot, `dev:portless`, single Submit click).

### Phase 4 — module channel (implemented)

- `defineModuleAi({ agentFns })`: passed through to
  `dynamicCapability().agentFns`, in-process channel like module `tools`. A
  function replaces a scanned `agent.json` of the same id.
- Within-turn re-assembly via park/resume deferred — no concrete agent needs
  it yet.

### Phase 5 (deferred) — within-turn re-render

Only if a concrete agent needs a capability change mid-run rather than at
the next turn boundary; see the D8/Non-goals note above.

### Docs

`packages/ai-core/docs/howto-agent-hooks.md` — the hook inventory, a
runnable phase-machine example (mirrors
`apps/ai/src/ai/agents/function-agents/issue-triage-demo.ts`), registration
for builtin vs. module agents, precedence/governance notes, and the
render-time constraints (sync-only, hooks-only-inside-render, etc.). Wired
into the `packages/ai-core` docs hub (`docs/README.md`, `docs/meta.json`)
and the package `README.md` tutorial table; `howto-define-module-ai.md`
gained the `agentFns` option and the `agent.ts` convention note.

## Assumptions this branch must prove (or refute)

1. **LOC budget holds**: core + wiring ≲ 350 non-test LOC, no mapping layer
   creep. If a translation step appears anywhere, stop and re-design.
2. **DX is actually better**: converting the builtin agent should *delete*
   config-override plumbing, not add a parallel path.
3. **Governance intact**: rendered `modelOverride` cannot bypass grants;
   guardrails/limits behave identically to row-authored agents (tests).
4. **State machine works between turns** with zero run-loop changes:
   transition in turn N visibly changes toolset/model-tier in turn N+1.
5. **No collision with file-based agents**: the converted agent keeps its
   `AGENTS.md`/`SKILL.md` files untouched; only `agent.json` is replaced.

## Gotchas / cautions (repo-specific)

- Shared checkout: never touch `engenty-pro` main worktree state; all work in
  this worktree; push via `git push origin HEAD:main` semantics when merging
  (worktree push gotcha).
- Dev servers: `pnpm dev:portless --domain=agent-hooks` only (plain `dev`
  fails in worktrees — studio task); pick a free dev slot in
  `.engenty/dev-slots.json` first.
- `resolveAgentModelId` precedence: rendered pins go through the same grant
  filter — do not add a second resolution path.
- `agentConfigSchema` uses zod defaults (`skillIds`/`toolIds` default `[]`) —
  frame draft must pre-init arrays so hooks can push before parse.
- Session metadata is "healed" on read (`session-service.ts:617`) — nest
  hook state under one key (`agent_state`) so healing logic never touches
  individual entries.
