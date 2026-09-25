# @engenty/ai-core – Development Instructions

Package-level guide for contributors and AI coding agents. Follow repo-wide rules from root [AGENTS.md](../../AGENTS.md).

## Package Purpose

`@engenty/ai-core` provides module AI registration, dynamic-agent contracts, Mastra tool builders, usage/model config, and AG-UI helpers. Product copilot chat runs on **`apps/ai` AG-UI**. Cleanup Phases A–E are complete (2026-05-29); public exports are registration, tools, AG-UI/agent-ui helpers, usage, and config only — see [docs/cleanup-plan.md](docs/cleanup-plan.md).

Canonical tenant, active Space, catalog, and execution-evidence semantics live in
[Spaces runtime contract](../../docs/agent/spaces-runtime.md). Keep the
model-facing prompt centralized in `src/agent-ui/space-contract-prompt.ts`.
Module AI authoring (`spacePolicy`, `spaceId` / `spaceConfined`, catalog vs
execute, Space skill visibility) is in [howto-define-module-ai.md](docs/howto-define-module-ai.md)
and is enforced by `pnpm ai:check`.

## Commands

- Build: `pnpm --filter @engenty/ai-core build`
- Test: `pnpm --filter @engenty/ai-core test`
- Lint: `pnpm --filter @engenty/ai-core lint`

**Tests:** Keep Vitest files under `__tests__/` next to the area under test. Import implementation modules with relative paths from those folders.

## AI Gateway (models)

Product chat is **not** AI SDK UI — use `apps/ai` + `@engenty/ai-ui` (AG-UI). Model ids come only from role bindings (`ai.model_binding`, manage → Role bindings), resolved via `resolvePurposeModel` / `resolveChatModelId` (`src/config/model-purposes.ts`) — no env model vars, no package default. See `docs/howto-ai-config.md`.

See [docs/dev/ai-gateway.md](../../docs/dev/ai-gateway.md) and `.cursor/rules/ai-gateway.mdc`.

## Package Layout

- `src/registry.ts` – `registerAiRegistration`, agent/workflow/skill resolution
- `src/dynamic-contracts.ts` – `AgentConfig`, `MastraToolDefinition`, module capability contracts
- `src/instructions/` – `compose-agent-prompt`, `copilot-seed-files`, `registry`, `resolver`
- `src/ag-ui/` – AG-UI message mapping, SSE event adapter, progress event types
- `src/agent-ui/` – agent UI prompt context, frontend-tool gating, navigation paths prompt
- `src/runtime/` – parallel fan-out, session title helper, thread id helper
- `ai/tools/<name>/` – canonical Mastra tool implementations; `src/tools/` re-exports only
- `src/usage/`, `src/config/` – usage recording, limits, model resolution
- **[README.md](README.md)** – overview, layout tree, entry points
- **[docs/cleanup-plan.md](docs/cleanup-plan.md)** – phased retirement tracker

## Docs Sync

When changing this package, keep docs in sync per `.cursor/rules/ai-core-docs.mdc`.

## Repo Rules That Apply

- **Biome**: Lint/format/fix at end of tasks
- **Vitest**: Add tests for new behavior
- **File size**: Propose a split if a file exceeds ~250 lines and mixes concerns
- **No legacy**: Avoid fallback code; remove stranded code

## Agent starter chips

Empty-state chips on a specialist start page come from `starters` on the
agent manifest (`modules/<m>/ai/agents/<id>/agent.json`), not from
`packages/ai-ui`. Schema: `packages/ai-core/src/agents/agent-starters.ts`.

Authoring rules:

1. A starter is a **job**, not a greeting: "Turn last week's calendar into hours",
   not "Help with time".
2. It must be answerable with the tools the agent actually declares. A starter
   that dead-ends into "I can't do that" is worse than no chip.
3. ≤ 40 chars on the chip; the prompt is a full sentence.
4. Ship `en` (`label` / `prompt`) + `locales.de`. Declare up to 6; the desk
   shows at most 3 after locale and `when` filtering.

Do not add per-agent branches in `packages/ai-ui`. Unknown specialists fall
back to generic chips only when `starters` is empty.
