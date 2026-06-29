# @engenty/ai-core – Development Instructions

Package-level guide for contributors and AI coding agents. Follow repo-wide rules from root [AGENTS.md](../../AGENTS.md).

## Package Purpose

`@engenty/ai-core` provides module AI registration, dynamic-agent contracts, Mastra tool builders, usage/model config, and AG-UI helpers. Product copilot chat runs on **`apps/ai` AG-UI**. Cleanup Phases A–E are complete (2026-05-29); public exports are registration, tools, AG-UI/agent-ui helpers, usage, and config only — see [docs/cleanup-plan.md](docs/cleanup-plan.md).

## Commands

- Build: `pnpm --filter @engenty/ai-core build`
- Test: `pnpm --filter @engenty/ai-core test`
- Lint: `pnpm --filter @engenty/ai-core lint`

**Tests:** Keep Vitest files under `__tests__/` next to the area under test. Import implementation modules with relative paths from those folders.

## AI Gateway (models)

Product chat is **not** AI SDK UI — use `apps/ai` + `@engenty/ai-ui` (AG-UI). Gateway model ids via `resolveChatModelId` / `DEFAULT_AI_CHAT_MODEL_ID` (`src/config/chat-model-id.ts`).

See [docs/dev/ai-gateway.md](../../docs/dev/ai-gateway.md) and `.cursor/rules/ai-gateway.mdc`.

## Package Layout

- `src/registry.ts` – `registerAiRegistration`, agent/action/skill resolution
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
