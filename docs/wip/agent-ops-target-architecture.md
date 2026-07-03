# Agent-ops target architecture — Tasks, Routines, Triggers on Mastra

Status: WIP · 2026-07-02 · companion to [mastra-1.48-overlap.md](./mastra-1.48-overlap.md)

## Principles

1. **One unit of work: the Task.** Everything that makes an agent do something —
   schedule, external event, user click, delegation — materializes a Task and runs it
   through the one durable task pipeline. Routines are never free-floating prompts.
2. **Engenty = domain + management UI. Mastra = runtime.** Engenty owns the business
   model (Tasks, Goals, tenancy, audit) and the UI to manage schedules/triggers/inbox.
   Mastra owns scheduling (Heartbeats), event ingestion (Signals/Providers), inbox
   mechanics (Notifications), run objectives (Goals), and execution (Workflows,
   Sessions).
3. **No parallel machinery.** Where a Mastra primitive covers a need, our homegrown
   equivalent is deleted, not kept as fallback.

## Target model

```
                        ┌─────────────────────────────────────────────┐
   Engenty UI           │        TRIGGER (Engenty domain row)         │
   (management)  ─────► │  kind: schedule | event | manual            │
                        │  target: task_template (always)             │
                        └───────┬─────────────────────┬───────────────┘
                                │ kind=schedule       │ kind=event
                                ▼                     ▼
                        Mastra Heartbeat       Mastra SignalProvider
                        (pg `schedules`)       (webhook / poll / module events)
                                │                     │
                                └──────► prepare/notify hook ────────┐
                                                                     ▼
                                                        materialize TASK from template
                                                        (module_tasks.tasks + dispatch)
                                                                     │
                                                                     ▼
                                                    task-job workflow (unchanged, durable)
                                                    specialist run · setObjective(acceptance)
                                                                     │
                                                                     ▼
                                            results → task_runs / activity / notifications
```

### Trigger (new Engenty domain concept, thin)

One row per "reason work starts", replacing `ai.custom_routine` + `ai.routine_state`:

- `kind: 'schedule' | 'event' | 'manual'`
- `task_template_id` — **required**. The template carries agent, prompt/brief, context
  bindings, allowed tools. (Existing module `ROUTINE.md` definitions become template +
  trigger declarations.)
- schedule triggers: `cron`, `timezone`, `quiet_hours` → one Mastra Heartbeat row
  (`metadata.triggerId` back-references us; our `prepare` hook enforces quiet hours by
  returning `null` = skip, and materializes the Task).
- event triggers: `provider_id` (`module-events` | `webhook`), `resource`, `event_filter`.
  **Design revision (2026-07-03, from compiled-dist verification):** Mastra
  `SignalProvider`s are agent/thread-scoped — every subscription is
  `(resourceId, threadId)` and the only delivery primitive is
  `sendNotificationSignal` into a thread; there is no anonymous "event → work"
  path, no mounted webhook route in the shipped 1.48 build (the documented
  `POST /api/signals/:providerId` does not exist), and subscriptions are
  in-memory. A trigger has no thread — its effect is materializing a Task — so
  event triggers do NOT ride SignalProviders. Instead the two ingestion edges
  call `triggers_fire` directly:
  - `module-events`: the tasks plugin subscribes to the existing plugin event
    bus (`engenty.events.modules.on`) and fires triggers whose `resource`
    matches the canonical event name (`<module>.<entity>.<verb>`), after the
    shallow `event_filter` payload match.
  - `webhook`: a secret-authenticated tasks-module route
    (`POST /api/tasks/trigger-hooks/:triggerId/:secret`) fires the trigger with
    the payload snapshot.
  Mastra signals/notifications are adopted where they actually fit — the
  Notifications/inbox phase (thread delivery, `ifIdle: wake`, the built-in
  `__mastra_notification_dispatcher` cron).
- `enabled`, `last_fired_at`, `last_result` — written from heartbeat `onFinish`/provider
  hooks for the management UI.

The UI manages Triggers; the backend translates to/from Mastra heartbeats +
subscriptions. Nothing schedules or parses cron on our side anymore.

### Task pipeline (unchanged core, two additions)

- Keep: `module_tasks.*`, dispatch queue, durable `task-job-workflow`, checkout
  correlation, action-job approval flow.
- Add: **run objectives** — specialist step derives acceptance criteria from the Task
  and calls `agent.setObjective(...)` on the run thread so the goal judge gates
  completion (in-memory until `@mastra/pg` ships `thread-state`; acceptable for bounded
  runs).
- Add: **completion notifications** — task finalize emits
  `sendNotificationSignal({source:'tasks', kind:'task_completed', …})` instead of any
  bespoke notification path.

### Inbox

Adopt Mastra Notifications wholesale: pg `notifications` domain, per-agent delivery
policy, dispatcher workflow, `notification-inbox` tool for agents. Engenty UI gets an
inbox view over the same storage (read/mark-seen/dismiss via thin API). Signals into
active threads use `session.sendSignal` with `ifActive/ifIdle` routing — no custom bus.

### Chat runtime (done on this branch)

`AgentController` + `Session` (see `apps/ai/src/ai/conversation/controller-session.ts`).
`Session.sendSignal` / `sendNotificationSignal` / `getSessionByResource` are the hooks
the inbox and heartbeat delivery use to reach live chats.

### Code Mode

Expose one `execute_typescript` tool (per agent that benefits: copilot, task
specialist) via `createCodeMode({ tools: <allow-listed engenty tool subset>, sandbox })`
on the existing Docker workspace sandbox. Use for bulk/multi-step tool orchestration.
The CLI agent stays the delegation target for free-form file/code work with artifacts.

### Voice

No change now (browser-side realtime stays). Revisit with Channels/telephony or when
Mastra ships a browser transport.

## Migration phases

Each phase deletes what it replaces — no dual paths.

1. **Routines → Heartbeats + Triggers.**
   Create the Trigger domain + formal task templates (the task-first rule is already
   enforced in `routines/executors.ts`; custom routines' `prompt/agent_id` columns are
   already reinterpreted as templates at read time — this formalizes that); write
   heartbeat `prepare/onFinish` hooks; drop `ai.routine_state`, `ai.custom_routine`,
   `routines/due.ts`, the pg_cron tick route. Management UI switches to Trigger CRUD.
   *Exit criterion: no Engenty-side cron parsing; a disabled Mastra scheduler = no
   routines fire.*
2. **Event triggers → Signal Providers.**
   Webhook provider mounted in Hono + persisted subscriptions + first module event
   provider (e.g. knowledge-base ingest or contacts). Same Task convergence.
3. **Notifications/inbox.**
   Task finalize + trigger errors emit notifications; agent gets the inbox tool; UI
   inbox view. Delete any ad-hoc notification paths as they're absorbed.
4. **Run objectives (Goals).**
   Specialist runs set objectives with judge gating. Gate on upstream `@mastra/pg`
   `thread-state` support for durability; ship run-scoped first if acceptable.
5. **Code Mode rollout.**
   Allow-list per agent, measure round-trip reduction on task runs, then default-on for
   the specialist.

Ordering rationale: 1–2 remove the most homegrown machinery and encode the
"routine = task + schedule/trigger" rule structurally; 3 is additive; 4 waits on
upstream storage; 5 is independent and can run in parallel with 3+.

## Open questions

- Trigger table placement: `module_tasks` (tasks module owns work-start reasons) vs.
  `ai` schema (runtime concern). Leaning `module_tasks` — it references task templates.
- Task templates: formalize as their own table vs. reuse existing ROUTINE.md-derived
  definitions serialized into the trigger row. Formal table preferred (UI-editable).
- Multi-instance: adopt Redis Streams pubsub before scaling apps/ai horizontally
  (signal wake races, heartbeat workers, background tasks all assume shared pubsub).
- Beta churn: Heartbeats/Signals APIs may break on minor bumps — pin `@mastra/*`, and
  every bump gets live runtime validation (typecheck/tests proved insufficient in the
  1.45→1.48 migration).
