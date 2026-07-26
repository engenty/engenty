# app-build: a durable workflow for building engenty Apps

Status: planned 2026-07-26, on `feat/engenty-apps`. Follows the chat E2E test of the same day.

## Why (what the test proved)

Post-rebuild, the chat agent (GPT-5 mini) found and used the real operations — but the
*sequence* lived only in the model's memory, and it fumbled it three ways:

1. Lost its own `app_id` across approval interruptions → created three duplicate app rows
   (`todo-app-2`, `todo-standalone-1` orphaned as drafts).
2. Every write op is `requiresApproval: true` (writeOp() in
   [gateway-methods.ts](modules/engenty-apps/src/api/gateway-methods.ts)), so one build =
   four HITL round-trips; one gate (`app_file_write`) ended the run with no actionable card
   after reload.
3. "Show me the app" produced an `html` artifact with the source *copied in* — a dead copy
   — instead of the `app` artifact handle `{app_id, session_id}`.

This is the case agentOS solves with `workflow()`/`ctx.step()`: the pipeline is code, the
agent lives inside one step. We already own the same primitive —
[task-job-workflow.ts](apps/ai/ai/workflows/task-job-workflow.ts) — so app-build becomes a
second Mastra workflow, not a new machine.

## Verified mechanics the design rests on

- Core gates `requiresApproval` ops via `evaluatePolicy` → `approvalService.consumeGrant`
  → 202 ([module-operation-routes.ts:610-632](apps/core/src/api/routes/plugins/module-operation-routes.ts)).
  A plain user-token gateway call executes without approval (verified live: browser
  `/gateway/app_create` succeeded directly); the HITL cards in chat come from the
  agent-actor path. Workflow steps invoking ops with the caller's token (no agent header)
  execute like the human's own clicks.
- Steps mint service scope via `resolveTaskJobServiceScope(tenantId)` (asserts tenant
  match) and call ops through `EngentyCoreClient.invokeTool` — the task-job pattern.
- The chat tool runs inside `engentyToolsRunAls`; `run.start()` executes steps in the same
  async context, so steps can read the user token from ALS without persisting it into the
  workflow snapshot. On resume-after-crash the ALS is gone → fall back to service scope.
- Artifact store: `createArtifactStoreFromEnv()` (memoized service-role store), the same
  factory artifact-tools use — NOT the ai/index barrel (circular import).
- Tool registration: add to `createBuiltinRegistryTools()` in
  [copilot-agent.ts:63](apps/ai/ai/agents/engenty.copilot/copilot-agent.ts); any agent
  listing the id in `agent.json` tools resolves it via `resolveTool`.

## Governance decision

The meaningful human gate is **activation** (`app_release_approve`, capability
`apps.approve`) — it stays a gated op the agent calls (or the human clicks), exactly as
today. Draft steps (create/write/propose) are reversible and serve nothing until approved;
gating each of them individually is what broke the flow. The `app_build` tool is the
agent-facing composite; its risk surface is "a proposed draft exists".

## Deliverables

1. **Schema** `apps/ai/src/ai/jobs/app-build-schema.ts` — input
   `{tenant_id, agent_type_key?, name, slug?, description?, manifest, files, thread_id?, session_id?}`;
   envelope adds `{app_id, version?, release?, build_log?, artifact_id?, status: "built"|"build_failed"}`.
2. **Steps** `apps/ai/src/ai/jobs/app-build-steps.ts`
   - `ensureAppStep` — find by slug via `app_list`, else `app_create`
     (`created_by_agent_type_key` for honest attribution). Idempotent: kills the
     duplicate-apps failure.
   - `writeFilesStep` — `app_file_write {app_id, files, manifest}`.
   - `proposeStep` — `app_release_propose`; on `app_build_failed` fetch the draft's
     `build_log` and complete the envelope as `build_failed` (the agent's fix loop reads
     it and re-invokes — versions don't advance on failed builds).
   - `publishArtifactStep` — when built and `thread_id` present: create the `app` artifact
     with handle `{app_id, session_id, app_version}` pinned to the built version, so the
     user previews exactly what they then approve. Never an HTML copy.
3. **Workflow** `apps/ai/ai/workflows/app-build-workflow.ts` (+ registration in
   `apps/ai/ai/index.ts`).
4. **Tool** `app_build` (`apps/ai/ai/tools/app-build-tool.ts`): reads ALS scope, starts the
   workflow (dynamic import of the mastra instance to break the agent→tool→index cycle),
   returns `{status, app_id, version, artifact_id, next_step}` or `{status, build_log}`.
   Registered in `createBuiltinRegistryTools()`.
5. **Agent surface** — app-coder `agent.json` gains `app_build`; `app-authoring` +
   AGENTS.md teach: author files → `app_build` → read `build_log` → fix → `app_build` →
   ask the human to approve via `app_release_approve`. Copilot AGENTS.md gets one line:
   app requests delegate to `engenty.app-coder` (progress then rides the existing
   sub-agent card — [delegate-run.ts:68-92](apps/ai/src/ai/conversation/delegate-run.ts)).
6. **Tests** — steps against a fake invoker (idempotent ensure, build-failure log capture,
   artifact handle shape, no artifact without thread); tool present in the builtin map.

## Out of scope (deliberate)

- Live per-step progress streaming into a dedicated chat widget — the sub-agent progress
  card covers delegated runs; a bespoke build card is follow-up.
- Headless routine-driven builds through the durable-approval path (task_runs) — the steps
  are written against the invoker seam so task-job can compose them later.
- Auto-activation. Never.
