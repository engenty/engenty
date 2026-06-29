# Chat stall after `engenty_tools_context` (2026-05-21)

## Symptom

Copilot shows language decision buttons (English / Deutsch) and a **Completed** `engenty_tools_context` tool card, but no assistant follow-up.

## Root cause (bounded)

1. **Stale open interrupt + new user message** — If a prior `requestDecision` run left `ag_ui_open_interrupt` on the session, the UI could still show a language chooser while the user typed a new message (composer enabled when `awaitingInterrupt` was false after reload/race). The new run could finish after `engenty_tools_context` without calling `requestDecision` again, leaving a confusing mixed state.

   **Fix:** `apps/ai` harness clears open interrupt metadata when a non-resume run accepts a new user message (`streamGenerate`).

2. **Expected HITL** — If the current run ended with `requestDecision` (language choices), the stream should emit `RUN_FINISHED` with `outcome.type === "interrupt"`. The composer stays disabled until the user picks a button and `resumeInterrupt` runs. No further assistant text until resume.

3. **Model did not call `requestDecision`** — After context, the agent may stop without a follow-up tool or text. That is not a transport/hydration bug; improve copilot instructions or operator prompt.

## Deferred

- Persist `choices` on `ag_ui_open_interrupt` for reload (manual matrix 4b).
- Heartbeat / action runtime no longer reads or writes `core.engenty_agent_runs` (Phase 5). `core.engenty_action_requests` remains for heartbeat request queue until automation moves to `ai.*`.
