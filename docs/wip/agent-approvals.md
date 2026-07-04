# Agent approvals — converging four HITL mechanisms onto native suspend/resume

Status: IMPLEMENTED (branch `feat/native-approvals`) · 2026-07-03 · basis: `@mastra/core` 1.48.0 (installed, behavior verified in compiled dist)

> **Implementation note — the design below was adjusted in one place.** The
> session-level `requireApproval` predicate (yolo off) turned out to be the wrong
> transport: with yolo OFF the compiled controller gates *all* tools (including
> controller builtins we don't own), and with yolo ON it auto-approves armed gates.
> What shipped instead: `engenty_tool_execute` declares `suspendSchema`/`resumeSchema`
> and calls `ctx.agent.suspend()` itself when the contract requires approval — the
> exact mechanism frontend tools already use — while `yolo: true` stays. The policy
> lives on the engenty-tools ALS run context (`approvalPolicy: "suspend" | "deny" |
> "artifact"`, default **deny**, fail-safe): interactive chat suspends, delegated
> leaf runs deny, voice keeps its artifact + `/v1/realtime/tools/approve` flow.
> Everything else below (contract-driven gate, per-operation grants in session
> metadata, 202 backstop, one suspend/resume path shared with frontend tools and
> parked sessions) landed as designed. **Restart recovery via
> `listSuspendedRuns` is DEFERRED**: suspended runs are parked in-memory with the
> same 15-min TTL as frontend-tool suspends; workflow snapshots exist in pg, so
> re-discovery on thread open remains a straight future enhancement.

## What we have today: four parallel mechanisms

1. **Tool approval (execute-boundary)** — [tool-approval.ts](../../apps/ai/ai/tools/engenty-tools/lib/tool-approval.ts):
   a pre-gate on the operation contract's `requiresApproval` returns a *decision
   artifact* instead of executing; the run is **aborted**, the user picks
   Approve once / Approve always / Deny, grants land in session metadata
   (`engenty_tool_approval_grants[_once]`), and the route **re-runs the agent from
   scratch** with the grant threaded through ALS. Core stays authoritative via a
   202 backstop.
2. **Sandbox `EXECUTE_COMMAND`** — native Mastra suspend/resume (workspace tool
   `requireApproval`), parked session.
3. **Frontend tools** — native suspend, parked session (`session-park.ts`).
4. **Decision/feedback artifacts** — AG-UI-native interrupts (not approvals proper).

Mechanism 1 is the odd one out: abort + full re-run wastes the in-flight turn, the
grant store is bespoke, nothing survives a server restart, and it exists *only*
because the old native gate keyed on tool **name** — useless when everything rides one
generic `engenty_tool_execute`.

## What changed in 1.48: the native gate can see the input

```ts
requireApproval?: boolean | ((input, ctx?: { requestContext?, workspace? }) =>
  boolean | Promise<boolean>);
```

The function form receives the **tool input** — i.e. the operation id and payload —
and its result is authoritative (overrides the global gate; errors fail closed). The
"too coarse" objection that led to `yolo: true` + our own gate is gone: one predicate
on `engenty_tool_execute` can resolve the contract per *operation* exactly like our
pre-gate does today.

What the native path buys over ours:

- **Suspend, don't abort**: the agentic-loop workflow parks at the tool call and
  resumes *exactly there* on approve/decline — no re-run, no lost turn.
- **Restart + multi-instance survival**: suspended runs persist as workflow snapshots
  (pg `workflows` domain — we already run PostgresStore);
  `agent.listSuspendedRuns({threadId})` rediscovers pending approvals after a crash,
  and `sendToolApproval` self-discovers the run from storage.
- **Delegation propagation**: a gated call inside a delegated child run bubbles the
  approval card to the supervisor and routes the decision back down — for free.
- **Session policy chain**: per-tool deny → yolo → per-tool policy → session grant →
  category grant → ask, with `always_allow_category` and a
  `toolCategoryResolver` we can back with contract metadata
  (`readOnly` → `'read'`, riskLevel/mutating → `'edit'`, sandbox → `'execute'`).

## Target design: one gate, engenty stays the policy brain

- **Transport**: native suspend/resume. Drop `yolo: true`; instead set
  `requireApproval` on `engenty_tool_execute` as a function that (a) resolves the
  operation contract, (b) consults engenty grants, (c) returns the decision. The
  execute-boundary *logic* (contract-driven, 202 backstop, per-operation grants)
  survives unchanged — only the interrupt/redo plumbing is deleted.
- **Grants**: keep engenty-owned persistence (per-thread "always allow" is
  per-*operation*, while Mastra's session grants are per-tool-*name* — too coarse for
  us, and in-memory only). The predicate reads grants from the ALS run context as
  today. Optionally mirror one-shot approvals through the session gate
  (`tool_approval_required` event → existing Approve/Deny card).
- **Sequential tools**: with approvals enabled, Mastra forces
  `toolCallConcurrency = 1`. Acceptable — most engenty ops are fast; revisit if
  parallel tool fan-out becomes a bottleneck (yolo-per-run stays possible for
  headless task runs where the action-job gate approves at a higher level).
- **Restart recovery**: on thread open, `listSuspendedRuns({threadId})` → re-render
  pending approval cards. This replaces "interrupt lost on restart" with real
  durability — a straight upgrade over both today's artifact flow *and* the parked
  in-memory session (which keeps its 15-min TTL only for frontend-tool suspends).

Mechanisms 2 and 3 already are native suspends — after this convergence, **every**
approval/HITL flows through one suspend/resume path; decision/feedback artifacts
remain a UI concern.

## Migration sketch

1. Wire `toolCategoryResolver` (contract → category) on the controller; keep yolo on.
2. Implement the `requireApproval` predicate on `engenty_tool_execute` (contract +
   grants); flip yolo off behind a flag; UI answers via
   `session.respondToToolApproval`.
3. Delete the decision-artifact tool-approval flow (`buildToolApprovalArtifact`,
   abort/re-run branch, 202-backstop artifact path — backstop then surfaces as a
   declined call with reason).
4. Add restart recovery (`listSuspendedRuns` on thread open).

Risks: the predicate runs on *every* gated call — keep contract resolution cached (it
already is, via the catalog); validate the delegation-bubbling path live (our
delegation is child-*run* based, not Mastra's in-process subagent tool — the child's
suspend surfaces in the child session, so the parent `delegate` tool must forward it,
same pattern as today's sandbox HITL).
