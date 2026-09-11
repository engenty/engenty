> **Superseded.** The narrative and decomposition below were written against the
> retired routine-as-standing-task model. The current work model is
> [work-model.md](../../content/dev/work-model.md); the acceptance criteria have
> been restated against it, the surrounding prose has not.

# UC-10 — Daily Digest of What Matters

Status: SPEC v1 · 2026-08-23 · first instance of the use-case spec format
(catalog: workspace-root `PLAN-use-case-specs.md`; source: team-brain.com/use-cases #10)

A routine is its own record: an operating prompt (or action target) plus a wake
source, owned by one mounted specialist. Instructions live in ONE place — the
routine's `instructions` field. Each fire is its own run and creates no task.

---

## Story

Every weekday morning, a digest of what matters — offers that closed, tasks still
open, contacts that arrived — is posted to a team-chat channel by an agent, without
anyone asking. The team reads one message instead of three module screens.

## Decomposition

| Piece | Value |
|---|---|
| Routine | "Daily digest", owned by the executor agent |
| Wake source | `kind: schedule`, cron `0 7 * * 1-5`, `timezone`: tenant-local (e.g. `Europe/Vienna`) — never bare UTC |
| Executor | a HEADLESS agent holding the discovery/execute surface (`engenty_tools_search` + `engenty_tool_execute`); today `tasks.assist` is the reference executor; post-Phase-1 the canonical setup is a hired "Digest" user agent. Never `engenty.copilot` (plan §3 Phase 2.7). |
| Instructions (`instructions`) | what to include (closed offers, open tasks, new contacts, lookback window), which channel, tone/length |
| Operations exercised (contract ids) | reads: `offers_list`, `tasks_list`, `contacts_list`, `team_chat_conversations_list`, `team_chat_conversations_history` · write: `team_chat_post_as_agent` |
| Approval surface | `approval_grants: ["team_chat_post_as_agent"]` on the routine — the single write, pre-approved at creation; anything else parks as first-run `tool_approval` |
| Outcome (`outcome`) | prose on the routine, max 4000 chars: "One digest message posted to #smoke-e2e naming every matching offer, open task, and contact." Deliberately not a schema — a run answers in prose. |
| Report (`report`) | `desk_card` — the digest is the point, so a finished run should surface on the specialist's desk (`quiet` is the default) |
| Side effects outside the tenant | none — this is why UC-10 is the first packaged routine |

## Acceptance criteria

Tiers per the catalog: T1 = wiring integration test (deterministic, no LLM) ·
T2 = Playwright smoke (UI surface) · T3 = scenario eval (real model, env-gated).

- **AC-1 (T1) Schedulable from any door.** Creating the routine via the REST door
  (`POST /ai/v1/routines`) or the gateway op (`routines_create`) leaves it actually
  scheduled: the routine has a live schedule and `GET /ai/v1/routines` reports a
  non-null `next_fire_at`. *(Regression net for PLAN-agents-as-routines Phase 0.1,
  fixed in `f5d84e9a0`.)*
- **AC-2 (T1) Tenant-local time.** With `timezone: Europe/Vienna` and cron `0 7 * * 1-5`,
  `next_fire_at` is 07:00 Vienna wall clock, across DST. *(Phase 0.2.)*
- **AC-3 (T1) One run per fire, and no task.** Consecutive fires produce DISTINCT
  run ids and create no task row at all; a fire while the routine's previous run is
  still active reports `dispatch: "skipped"` and starts nothing.
- **AC-4 (T1) Unattended fires keep tool access.** A scheduled (no-human) fire in a
  private space still resolves module operations — the acting-user attribution is
  stamped from the routine's creator. *(Phase 0.3, fixed in `f5d84e9a0`.)*
- **AC-5 (T3) Content is grounded.** With seeded fixtures (see below), the posted
  digest names every fixture exactly and invents nothing (no records that don't exist).
- **AC-6 (T3) Delivery + continuity.** The digest lands in the configured channel as
  an agent-authored message; a second fire posts a second message; both runs ride the
  ONE routine thread (`GET /ai/v1/routines/:id/runs` lists two runs sharing one thread id).
- **AC-7 (T1) Pause and bypass.** `enabled: false` → the wake source never fires;
  manual run-now (`POST /ai/v1/routines/:id/run`) works regardless of quiet hours.

## Fixtures & grading (T3)

Seed via the operations door (`POST /api/operations/<op>/invoke`), each name carrying
a unique stamp so grading is exact string containment — **no LLM judge in v1**:

| Fixture | Op | Graded assertion |
|---|---|---|
| 1 offer `UC10 Offer <stamp>` | `offers_create` | named in the digest |
| 2 open tasks `UC10 Task A/B <stamp>` | `tasks_create` | both named; count "2" plausible in text |
| 1 contact `UC10 Contact <stamp>` | `contacts_create` | named in the digest |
| digest message | — | exists in the channel, posted after fire time |

The scenario's instructions constrain the digest to `UC10 <stamp>`-prefixed records so
grading stays deterministic; the production routine's brief is looser ("yesterday's
closed offers…"). That delta is deliberate and lives only in the scenario.

## Test plan

- **T1** — land AFTER the in-flight Phase 2 lands (its own suites already touch much
  of this: `trigger-fire.test.ts`, `trigger-gateway-attribution.test.ts`,
  scheduler drift tests). Then audit those against AC-1/2/3/4/7 and add only what's
  missing, as `*.integration.test.ts` next to the code they pin. Do NOT write these
  against the current uncommitted state.
- **T2** — covered incidentally by the routines UI specs when the routine detail page
  lands (plan Phase 2.5); no UC-10-specific smoke needed in v1.
- **T3** — `e2e/scenarios/uc-10-daily-digest.scenario.spec.ts` (this change), gated on
  `ENGENTY_SMOKE_LLM=1` like `copilot.smoke.spec.ts`. Drives ONLY public seams
  (agent-login → operations door + `/ai/v1/routines`), so it survives internal
  refactors. Requires the dev stack + an AI gateway key + a `smoke-e2e` team-chat
  channel in the dev tenant.

## Open points

1. Executor default: keep `tasks.assist` until the hire-an-agent surface (Phase 1)
   makes "Digest Agent" a one-step setup; scenario overridable via `UC10_AGENT_KEY`.
2. Channel provisioning: scenario expects `smoke-e2e` to exist (same convention as
   `team-chat.smoke.spec.ts`); auto-create needs a channel-create operation contract.
3. "Closed offers" definition: v1 grades on the seeded offer's presence, not status
   transitions — sharpen once offer-status fixtures are worth the setup cost.
4. Vocabulary: this spec predates the `action_graph` → `workflow` rename
   (rings 1-2, `e325c52a7`/`fdfddd1ac`). The flow-target field is `workflow_id`;
   UC-10 targets an agent, so nothing here depends on it.
5. Executor eligibility (VERIFIED): custom routines may only be owned by role
   `specialist` (`canAgentOwnRoutine`, `packages/plugin-sdk/src/agent-role.ts`) —
   the copilot, the coordinator, `chatbot.*`, and any `*.answers` chat surface are
   all excluded. `tasks.assist` resolves to `specialist`, so the scenario default is
   valid; a `UC10_AGENT_KEY` override pointing at e.g. `knowledge-base.answers`
   would fail at create, not at grading.
