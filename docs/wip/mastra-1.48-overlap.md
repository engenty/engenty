# Mastra 1.48 × Engenty agent-ops — overlap analysis

Status: WIP · 2026-07-02 · basis: `@mastra/core` 1.48.0 installed on `feat/mastra-upgrade`
(every API below verified against the installed `.d.ts`, not just docs)

This doc maps each new Mastra primitive against what Engenty built (or planned) itself,
and states per area whether we **adopt**, **keep**, or **hold**. The resulting target
design lives in [agent-ops-target-architecture.md](./agent-ops-target-architecture.md).

## The one-line summary

Mastra 1.48 ships the *runtime* half of our Goals/Tasks/Routines/Triggers concept —
scheduling (Heartbeats), event ingestion (Signals + Signal Providers), an agent inbox
(Notifications), and run-scoped objectives (Goals). Engenty keeps the *domain* half —
the business Task/Goal model, tenancy, and the management UI — and deletes its own
scheduler/trigger plumbing in favor of the Mastra APIs.

## How Mastra's pieces layer (important for everything below)

Signals are the substrate; everything else is a specialization:

- **Signals** (BETA) — typed inputs pushed into agent threads outside request/response.
  `agent.sendSignal` / `session.sendSignal` with `ifActive: deliver|persist|discard` and
  `ifIdle: wake|persist|discard` routing. A woken run resolves `{action:'wake', runId}`.
- **Heartbeats** (BETA) — persisted cron schedules (`mastra.heartbeats.create({agentId,
  cron, prompt, threadId?, ifActive?, ifIdle?, metadata?})`) whose fire is either an
  isolated `generate` (threadless) or a signal into a thread. Lifecycle hooks
  (`prepare` — can rewrite or skip a fire; `onFinish`; `onError`) live on the Mastra
  instance. Storage: `schedules` domain — **implemented in @mastra/pg 1.14.3**.
- **Signal Providers** (BETA) — external event sources (`WebhookSignalProvider`, custom
  subclasses with `poll()` or `handleWebhook()`) that `notify()` into the signal runtime.
  Subscription registry is in-memory by default.
- **Notifications** — record-first signals: persisted `NotificationRecord` with
  `status: pending|delivered|seen|dismissed|archived|discarded`, a per-agent delivery
  policy (`deliver|queue|defer|summarize|persist|discard`), a scheduled dispatcher
  workflow, and a `notification-inbox` tool. Storage: `notifications` domain — **in pg**.
- **Goals** (BETA) — a durable per-thread objective (`agent.setObjective(objective,
  {threadId, judgeModelId?, maxRuns?})`) judged by an LLM after each turn; the loop
  continues/stops on `continue|done|waiting`. Stored in the `thread-state` domain —
  ⚠️ **NOT implemented in @mastra/pg 1.14.3** (in-memory fallback only, no cross-restart
  durability yet).
- **Background Tasks** (stable-ish) — async tool dispatch with retries/suspend/resume,
  `background-tasks` storage domain (in pg). This is *tool-call* level, distinct from
  Engenty business Tasks.

## Area-by-area

### 1. Tasks — KEEP (Engenty-owned), already on the right substrate

Engenty Tasks (`module_tasks.tasks/task_runs/task_activity/task_contexts/…`) are business
objects: assignees (user or agent), priority, cross-module contexts, collaborators, audit
log. Nothing in Mastra models this — Mastra's "tasks" (`task_write` tools,
`TaskSignalProvider`, thread-state `'task'` slot) are the agent's *internal* working-todo
list for one thread, and Background Tasks are async *tool calls*. No overlap to migrate.

Execution is already correct: a task run is a durable Mastra Workflow
(`task-job-workflow`: checkout → brief → specialist → result → finalize) with Postgres
snapshots. **The Task stays the single unit of scheduled/triggered/delegated work.**

### 2. Routines (Heartbeats) — ADOPT Mastra Heartbeats, delete our scheduler

Today: `ai.routine_state` + `ai.custom_routine`, a pg_cron `POST /routines/tick` every
minute, our own cron parsing (`routines/due.ts`), quiet-hours logic, and executors whose
only action is creating a Task from a template (`target.kind='task_template'` — legacy
`agent_prompt`/`action` kinds are already rejected). The task-first rule is thus already
enforced in code; custom routines' stored `prompt/agent_id` columns are reinterpreted
into a task template at read time (`routine-registry.ts`). What's missing is only the
formalization (a real task-template model) — and the entire scheduling layer is still
homegrown.

Mastra Heartbeats replace the entire scheduling layer: persisted cron rows (pg
`schedules` domain), timezone support, pause/resume, fire-now, per-fire `prepare` hook
(our quiet-hours + task-materialization seam) and `onFinish/onError` (our
`last_run_at/last_result` bookkeeping). Our tick route, due calculation, and both
routine tables go away.

**Rule (per product decision): a routine is a schedule attached to a Task template —
never a free-floating prompt.** The heartbeat's `prepare` hook materializes a Task and
routes it into the existing dispatch queue; the heartbeat prompt itself is never sent to
an agent directly. Custom "prompt routines" migrate by wrapping their prompt into a task
template.

### 3. Triggers / event ingestion — ADOPT Signal Providers (greenfield for us)

Engenty has no first-class trigger model — `trigger` is a metadata enum on
`ai.action_request` (`message|command|button|cron|hook|direct`). Event triggers were
planned but never built. Mastra's Signal Providers are exactly that plan:
`WebhookSignalProvider` for inbound webhooks, custom providers (poll or webhook) for
module events (new email, contact created, …).

Same convergence rule as routines: **a trigger's effect is materializing a Task** (or,
for lightweight nudges into an existing thread, a signal with `ifIdle: wake`). Schedule
triggers = Heartbeats; event triggers = Signal Providers; both end in a Task.

Caveats: provider subscription registries are in-memory (we persist subscriptions in our
own table and re-subscribe on boot); webhook route mounting must be wired explicitly in
our Hono server (auto-mounting is not guaranteed).

### 4. Goals — KEEP business goals, ADOPT run objectives (behind the pg gap)

Two different things sharing one word:

- **Engenty Goals** (`module_tasks.goals`): hierarchical planning containers with owners
  and lifecycle (`planned|active|achieved|cancelled`). Pure domain model + UI. Keep.
- **Mastra Goals**: an execution-loop objective for one thread with an LLM judge. Adopt
  *inside task runs*: when the specialist starts a task, `setObjective(thread,
  acceptance criteria derived from the Task)` so the judge drives completion instead of
  prompt-only "you are done when…" instructions.

⚠️ Blocker for full adoption: `@mastra/pg` 1.14.3 lacks the `thread-state` storage
domain, so objectives are in-memory only — fine within one bounded task run, not durable
across a crash-resume. Track upstream; wire it when pg ships the domain.

### 5. Notifications / inbox — ADOPT for the agent inbox

We have no agent inbox. Mastra's record-first notification pipeline (persisted records,
delivery policy, deferred dispatch workflow, `notification-inbox` tool) plus
`Session.sendNotificationSignal` / `AgentController.getSessionByResource` (deliver into
the session owning a thread) is the intended host integration. The Engenty UI reads the
same `notifications` storage for a human-visible inbox view.

### 6. Code Mode vs. CLI agent — ADOPT Code Mode as a tool; KEEP the CLI agent

They solve different problems:

- **Code Mode** (`createCodeMode({tools, sandbox?})` → one `execute_typescript` tool):
  the model writes one TypeScript program calling allow-listed tools as `external_*`
  functions over JSON-RPC into a sandbox. It is a *tool-orchestration* optimization —
  fewer round-trips, real filtering/aggregation in code, schema validation preserved.
- **Engenty CLI agent** (`engenty.cli`): a *delegated specialist* with its own child
  thread, Docker sandbox session, file lifecycle (`/sandbox`, syncOut to file storage),
  and structured execution report. That is a child-run + artifact story Code Mode does
  not cover.

Adopt Code Mode where the copilot/task specialist today chains many
`engenty_tool_execute` calls (bulk reads, cross-module joins, aggregation) — the sandbox
requirement is already met by our Docker workspace sandbox. The CLI agent remains the
delegation target for free-form file/code work. Not either/or.

### 7. Voice — HOLD (transport gap)

Engenty voice today: browser-side OpenAI Realtime session with gated voice tools —
works, WebRTC-quality UX in the browser. Mastra's `MastraVoice` (agent-level
`config.voice`, realtime via resolver per session) is a **Node-side WebSocket client**;
core has no browser transport, so migrating would mean relaying mic audio through our
server for a worse result. Provider packages aren't installed.

Hold: keep the current client-side implementation. Revisit when Mastra ships a browser
transport, or when we need *server-side* voice (channels/telephony) — that's where
`CompositeVoice` + the `/voice/*` server endpoints slot in naturally.

### 8. Also relevant, not urgent

- **SDK Agents / ACP** (separate uninstalled packages `@mastra/claude`, `@mastra/acp`):
  wrap Claude Code / Codex / ACP-speaking CLIs as Mastra sub-agents. Interesting as a
  future upgrade path for `engenty.cli`, not needed now.
- **A2A** (in core): every agent already exposable at `/api/a2a/<agentId>` with agent
  cards — the future external-integration surface.
- **Channels** (in core, pg-backed): Slack/Discord/Telegram binding incl. approval cards
  and heartbeat post-back. Natural phase after notifications; the management UI would
  own connection state.
- **Durable Agents** (BETA): agentic loop as a workflow. Our task/action workflows
  already give us durability at the job level; revisit if we want durable *chat* runs.

## Maturity & infrastructure risks

| Concern | Detail |
|---|---|
| BETA surfaces | Goals, Signals, Signal Providers, Heartbeats, Durable Agents are `@experimental` — breaking changes on minor bumps. Pin + re-validate per bump (see the 1.45→1.48 runtime-only breakage precedent). |
| pg `thread-state` domain missing | Blocks durable Goals/agent-task-list state. In-memory fallback silently engages. |
| Multi-instance | Signal wake races, background-task dispatch, and heartbeat workers need shared pubsub (Redis Streams) beyond a single apps/ai instance. Fine today (single instance), must be solved before horizontal scaling. |
| In-memory provider subscriptions | Persist trigger subscriptions ourselves; re-subscribe on boot. |
