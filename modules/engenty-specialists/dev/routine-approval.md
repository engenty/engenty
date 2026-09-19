# When creating a routine needs a person

The mode × situation matrix is in `docs/content/dev/work-model.md` ("Who
creates a routine"). This note is what a maintainer of the tool needs on top.

Code: `apps/ai/ai/tools/routine-approval.ts` (the decision and the card),
`apps/ai/ai/tools/routines-tools.ts` (`routines_create` / `_update` / `_list`
/ `_run`), `apps/ai/ai/tools/engenty-tools/lib/caller-scope.ts` (who is
calling). The playbook the model reads is `ai/skills/routines/SKILL.md`.

## One dial

The agent-approval mode the platform already has — tenant
`ai.config.agent_approval` → space `agent_approval_mode` → per-agent, most
restrictive layer wins (`resolveEffectiveAgentApprovalMode`, the same
resolver the task lane reads). Not a prompt rule: the tool decides.

- `manual` — a person approves every routine, prompt or Workflow: one inline
  card that, on Approve, publishes the Workflow AS THAT PERSON and creates the
  routine in the same step.
- `auto` — the model decides. It creates on its own, or sets `ask_first`
  when the job is unclear or writes records; the same card appears.
- `pass-all` — no card.

`approval_grants` are the exception on every setting: they let a fire run
gated writes with nobody watching, so a person always confirms them.

## Who may call what (`caller-scope.ts`)

The copilot manages every routine in the Space; a coordinator (a hired
engenty that reports to nobody there) the ones of the engenties it answers
for; a specialist only its own — and its own it may create. Same tool objects
for everyone; the narrowing comes from the run's own `agentTypeKey`, never
from which agent declared the tool. A specialist's `agent_id` is forced to
itself; `workflow_propose` is self-scoped the same way.

## Self-publish

A prompt routine keeps the invariant "a routine binds a published workflow"
by materializing a one-node `run_specialist` workflow with the prompt baked
in (`prompt-workflow.ts`); the routine row still names a `workflow_id`.
Where the mode lets the run go live without a person, the run publishes the
version it wrote with its own capabilities — `validateGraphAction` against
the run's re-resolved scope, exactly what `publishFromDecision` does with the
human's. A graph the run cannot perform stays a draft and the routine is
created **disabled**, with the note saying why.

## Runs that cannot park

A headless task job, a routine's own run and a delegated child have nobody
to answer a card. Where the card is required the call refuses and names the
coordinators who can do it (`coordinatorIdsForRun`); where the model merely
asked for one, the routine is created and the Space hears about it.

Every creation leaves a note on the owner's desk (`speakOnDesk`) and a
`routine_created` inbox row.
