# engenty-copilot — module contract notes

Stays builtin; same directory layout; not on `defineModuleAi`.

- `apps/ai` imports this package directly (`createEngentyCopilotAgent`,
  `engentyCopilotAgentConfig`, …) instead of consuming an `AiRegistration`
  from a plugin registrar — there is no `ai/registrar.ts` to migrate.
- The copilot agent's tools are built in code per request (vault, catalog,
  frontend tools, runtime-injected `EngentyCopilotRuntimeTools`), and its
  instructions are layered at runtime; a static `defineModuleAi` scan cannot
  produce its registration.
- The directory layout already matches the Phase 5 convention:
  `ai/agents/engenty.copilot/agent.json` (+ `AGENTS.md`, `SOUL.md`) and
  `ai/skills/<name>/SKILL.md`, so tooling like `pnpm ai:check` covers it.

If the copilot ever becomes a regular plugin module, migrate it with the
same recipe as the other modules (see
`packages/ai-core/docs/howto-define-module-ai.md`).
