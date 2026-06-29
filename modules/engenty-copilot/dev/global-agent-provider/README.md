# EngentyAI global agent provider

**Status: complete (2026-05).** Hard cutover to `EngentyAI` at the app shell plus module-local `EngentyAgent` boundaries is landed.

## Active docs

| Doc | Purpose |
|-----|---------|
| [GOAL.md](./GOAL.md) | Mount rules — global copilot only in `apps/ui`; module agents in `modules/*` |
| [BRUTAL-CUTOVER.md](./BRUTAL-CUTOVER.md) | Archive-first, no-fallback doctrine (still applies to future cutovers) |

## Canonical product contract

- [AG-UI apps/ai session](../../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md)
- [active-copilot-v1-decision.md](../active-copilot-v1-decision.md) — one `engenty:copilot` host
- [Agent UI runtime](../../../../docs/dev/agent-ui-runtime.md)

## Verification (when touching this area)

```bash
pnpm --filter @engenty/ai-ui test
pnpm --filter @engenty/engenty-copilot test
pnpm exec biome check --write modules/engenty-copilot/dev/global-agent-provider
```

Manual E2E: [manual-e2e-matrix.md](../manual-e2e-matrix.md).

## Archived

Per-phase implementation plans (phases 0–4, CUTOVER-MAP, RFC) were removed after sign-off. Decisions live in [agentic-framework-tracker.md](../../../../docs/dev/wip/agentic-framework-tracker.md) (2026-05-19 through 2026-05-28 entries).
