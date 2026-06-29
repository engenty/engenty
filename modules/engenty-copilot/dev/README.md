# Copilot dev planning

Architecture notes for copilot module chat (`/module/engenty-copilot/chat/*`).

## Start here (active)

| Doc | Purpose |
|-----|---------|
| **[active-copilot-v1-decision.md](./active-copilot-v1-decision.md)** | Current direction: one `engenty:copilot` host, many view modes |
| **[GOAL.md](./GOAL.md)** | Tracks A–D status, hard rules, definition of done |
| **[AG-UI / CopilotKit alignment](../../../docs/content/wip/ag-ui-copilotkit-alignment/index.md)** | **Track D (active WIP):** tool rows, HITL, frontend-tool lifecycle |
| **[phase-8-local-recovery-store.md](./phase-8-local-recovery-store.md)** | Optional later: composer draft / interrupted-run recovery |
| **[manual-e2e-matrix.md](./manual-e2e-matrix.md)** | Manual QA checklist |

## Reference (stable)

| Doc | Purpose |
|-----|---------|
| [global-agent-provider/GOAL.md](./global-agent-provider/GOAL.md) | `EngentyAI` mount rules — global copilot in `apps/ui` only |
| [global-agent-provider/BRUTAL-CUTOVER.md](./global-agent-provider/BRUTAL-CUTOVER.md) | Archive-first cutover doctrine |
| [frontend-tool-interrupt-resume.md](./frontend-tool-interrupt-resume.md) | Hybrid v1 frontend-tool interrupt/resume |
| [generative-ui-output-contract.md](./generative-ui-output-contract.md) | Output shape + phase lifecycle for generative-ui widgets |
| [docs/content/dev/ai-agents/ag-ui-apps-ai-session.md](../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md) | Published client/server contract |
| [docs/dev/agent-ui-runtime.md](../../../docs/dev/agent-ui-runtime.md) | Package ownership + ai-ui/embed boundary (migration complete 2026-05-29) |
| [docs/dev/agentic-framework-tracker.md](../../../docs/dev/wip/agentic-framework-tracker.md) | Milestones and dated decisions |

## Debug / niche

| Doc | Purpose |
|-----|---------|
| [chat-new-flow-debug.md](./chat-new-flow-debug.md) | `/chat/new` flow logging |
| [chat-stall-after-context-tool.md](./chat-stall-after-context-tool.md) | Context-tool stall notes |
| [copilot-personal-workspace.md](./copilot-personal-workspace.md) | User-scoped copilot workspace |

## Completed tracks (archived)

Tracks **A–B** (phases 1–7b), **global-agent-provider** phases 0–4, and **frontend-tool cutover** are **done**. Outcomes are recorded in [GOAL.md](./GOAL.md), [agentic-framework-tracker.md](../../../docs/dev/wip/agentic-framework-tracker.md), and [TRASHBIN.md](../../../TRASHBIN.md). Per-phase implementation checklists were removed to avoid stale open boxes.

## Implementer rule

If the fix is `dedupeConsecutiveAgUiUserMessages`, `mergeHydratedAgUiMessages`, `shouldSkipAgUiHydration`, or `hydrationPaused` — **stop** and follow Track D ([CopilotKit alignment](../../../docs/content/wip/ag-ui-copilotkit-alignment/index.md)) instead.
