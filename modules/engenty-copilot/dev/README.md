# Copilot module — living notes

Short contracts for `/mdl/engenty-copilot/chat/*` and the shared `engenty:copilot`
host. Prefer package docs for wire protocol; keep these for product/module
decisions that don't belong in `@engenty/ai-ui` / `ag-ui-bridge`.

## Docs

| Doc | Purpose |
|-----|---------|
| [active-copilot-v1-decision.md](./active-copilot-v1-decision.md) | One `engenty:copilot` host, many view modes; mount + session rules |
| [frontend-tool-interrupt-resume.md](./frontend-tool-interrupt-resume.md) | Native AG-UI suspend/resume for browser tools (auto-execute) |
| [generative-ui-output-contract.md](./generative-ui-output-contract.md) | `generative-ui` output envelope + collapse phases |
| [copilot-personal-workspace.md](./copilot-personal-workspace.md) | Assistant-preset workspace mounts + search/sandbox |

## Package docs

- [`packages/ag-ui-bridge/docs/frontend-tools.md`](../../../packages/ag-ui-bridge/docs/frontend-tools.md) — frontend tool definitions + catalog
- `@engenty/ai-ui` — `ActiveCopilotProvider`, thread binding, composer draft recovery (`local-recovery.ts`)

## Hard rule

Do not “fix” duplicate bubbles with text dedupe, hydrate-skip, or `hydrationPaused`.
Server `MESSAGES_SNAPSHOT` is authoritative.
