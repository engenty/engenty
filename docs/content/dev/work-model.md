---
title: Work model
description: The canonical nouns — Engenty, workflow, routine, run, task — and the invariants that keep them apart.
---

# Work model

This page is **the** reference for what each noun means. Other docs, skills and
prompts link here rather than restating the model; three drifting copies of a
glossary is how the previous model went wrong.

Three things the product used to collapse into one are separate here:

- **who you talk to** — an Engenty,
- **jobs that run** — routines,
- **work items** — tasks.

A daily standup is not one forever-task with a cron on it. The meeting is the
routine, the follow-ups are tasks, and nobody keeps a card called "do
standup".

## The nouns

| Noun | One sentence |
|---|---|
| **Engenty** | A custom or module-shipped agent, mounted on a Space. The thing you talk to and the thing that owns routines. Registry `role` stays `specialist`. |
| **Desk thread** | Human ↔ Engenty chat. Continuity for the conversation, not a run transcript. |
| **Workflow** | The published runnable: input parameters plus steps. Steps are *either* one agent turn *or* a multi-node graph. Stored as a Mastra graph. |
| **Routine** | **The job.** An Engenty owns it. It targets a workflow, has 1..n wake sources, and declares an outcome promise. |
| **Run** | One firing of a routine (or a chat turn). Inspectable, with a timeline of tool calls and a result. |
| **Task** | A work item: title, status, assignee, comments, dependencies. Something someone is meant to do. |
| **Space** | The mount set — which apps, agents, connections, skills and module operations a run may reach. |
| **Workspace** | Run-scoped file mounts (`/home`, `/space`, `/skills`). Not the module database. |
| **`/data`** | A projection of *mounted* modules; reads and writes go through those modules' real operations. |
| **Memory** | Disposable working and observational context. Never the business record. |

**Routine is the job.** There is no wrapper noun around it. Triggers are child
rows of the routine (`ai.routine_triggers`), not a sibling object. The canvas
`[wake] → [workflow steps] → [outcome]` is one Routine.

"Flow" is **not** a product noun. It names the internal graph JSON (Mastra
`DynamicWorkflowGraph`) only. The user-facing word for the published runnable
is **Workflow**. "Action" is retired as a domain noun; leftover `action*`
identifiers in code are a migrate-me marker until they are gone.

## One place for each instruction

An agent's instructions (AGENTS.md, `agent_propose`) say **who the agent is and
how it always works** — mandate, tone, standing constraints. A routine's
instructions say **what this particular job is** — the procedure for this
routine only. The test: a sentence true on every run of the agent belongs on
the agent; a sentence true only for this job belongs on the routine (or the
workflow it targets). Neither restates the other — the same procedure written in
both places is a bug, because only one copy gets edited.

An Engenty is complete without a routine; a routine is how it also works
unattended. Only a hire **for recurring work** is unfinished until its routine
exists.

## The invariants

1. **Creating or firing a routine creates no task.** A routine that has never
   produced a work item is working correctly.
2. **Every execution is a run.** A chat turn, a routine fire, a run-now, a
   button press and "work this task" are different *triggers of a run*, not
   different systems.
3. **A task is an optional subject of a run.** Completing a run does not
   silently complete a task.
4. **Durable results are module rows, files, or artifacts** — never memory, and
   never a task standing in for a record.
5. **The workflow target lives on the routine**, not on a task.
6. **Overlap is decided on the run:** a fire is skipped while that routine's
   previous run is still active.
7. **Only an Engenty owns a custom routine.** Copilot is the live interface,
   not a worker, and it does not wake on its own. Module-declared housekeeping
   (`source: module`) is the one exception: those rows are reviewed like code
   and may name an interface agent as the principal of a **headless** run.
8. **Execution is at-least-once.** A crash can replay an active step, so every
   external write carries an idempotency key.

## How work starts

| Way in | What happens |
|---|---|
| **Chat** | The Engenty answers on its desk thread. Bounded work finishes in the conversation. |
| **Routine — schedule** | Cron wakes the routine; it starts a run. Quiet hours suppress scheduled fires only. |
| **Routine — event** | A module event or inbound webhook starts a run per occurrence. The payload becomes the workflow's input (through a mapping when one is declared) or prose in the brief. |
| **Run now** | A person runs a routine immediately. Same run, bypasses quiet hours. |
| **Press** | A button, chip or slash command fires the routine through its **manual** trigger. Subject-bound run; no task. |
| **Assignment** | Assigning a task to an Engenty starts a run whose *subject* is that task. A task assigned to a person starts nothing. |

All of these converge on one run index and one executor. What differs is the
trigger recorded on the run. A press is still a routine fire: publishing an
owned workflow wraps it with `manual` and `agent` trigger rows so it is
pressable and invokable.

## Who creates a routine

Every Engenty may create and change **its own** routines; a coordinator (an
Engenty that reports to nobody in the Space) may give one to any mounted
teammate; the copilot manages all of them. The verbs are the same tools
(`routines_create` / `routines_update` / `routines_list` / `routines_run`),
scoped from the run's identity — not from which agent declared them.

The body is a **prompt** (one step; the server keeps a published one-node
workflow for it) or a **workflow id** (more than one step, an approval, or a
wait — `workflow_propose` first). Creating the routine publishes a draft
workflow it targets.

Whether a person confirms first is the Space's agent-approval mode, the same
dial the task lane reads:

| Situation | `manual` | `auto` | `pass-all` |
|---|---|---|---|
| prompt routine, no grants | one inline card | the agent decides (`ask_first` asks anyway) | created |
| workflow-backed | one card: publish **as that person** + create | created; the run publishes the draft with its own capabilities | same |
| any `approval_grants` | card | card | card |
| run that cannot park (task job, routine fire, delegate) | refused, naming the coordinator | created + inbox notice | created |

Every creation leaves a note on the owner's desk and a `routine_created`
inbox row. A workflow the run cannot validate for itself stays a draft and
the routine is created **disabled** until a person publishes on the canvas.

## When a run needs a person

A run can stop for an approval, a capability the Engenty may not yet use, or
a question it asks. In every case the **run** suspends and the ask surfaces on
the Engenty's desk as a card. Answering resumes that same run.

A task is created only when policy says a human must own a follow-up — "review
these twelve ambiguous senders" is a task; "the importer needs permission to
write contacts" is an approval on the run.

For unattended work, **standing grants are the design and the card is the
remainder path**: a routine's approval grants cover what its runs are expected
to do, and the desk card exists for what falls outside them. If the card
becomes the normal path, the work has stopped being unattended — widen the
routine's grants instead of answering the same card nightly.

## Where results live

A run's deliverable is a module record, a file, or an artifact — written through
the operations of modules **mounted in the Space**. A fact stated in chat must
come from a successful operation result.

Retiring an Engenty drops its memory, pauses its routines and unmounts it. It
does not delete contacts, files, or genuine tasks.

## Naming planes

The same word can mean different things at different layers. Qualify it when the
sentence could be read on more than one.

| Word | Product | Security (core) | Execution (Mastra, in-run) |
|---|---|---|---|
| **task** | a work item on the board | — | a background task: one unit of execution |
| **goal** | — (not a product noun) | the *subject* a grant is attached to | the objective a judge scores against |
| **schedule** | the wake source of a routine | — | the cron substrate that fires it |
| **workflow** | the published runnable | — | a compiled graph of steps |
| **failed** | `outcome: failed` — the *work* failed (a business refusal, a bounce, a rejected import) | — | `run.status: failed` — the *run* crashed |

## Outcome and reporting

A run has two verdicts on different planes, recorded side by side:

- **`run.status`** (`completed | failed`) is the engine's word — did the run
  crash. It is never the workflow's opinion of the work.
- **`outcome`** (`ok | nothing_to_do | partial | needs_attention | rejected |
  failed`) is the workflow's own verdict, carried in its declared output. A nightly
  import that found nothing is `completed` + `nothing_to_do`; one the
  counterparty refused is `completed` + `rejected`. Calling workflows branch on
  outcome; the engine never does.

**Reporting** (`silent | info | verbose`) says how loudly a run's result lands
in the owner's chat. It is a per-run widening of the routine's `report` knob:
the run's value wins when present. `nothing_to_do` defaults to `silent`;
failures and `needs_attention` always report, whatever the level.

A routine with `report: ask` goes one step further: a completed run is **held**
(`requires_action`, like a gate) until a person marks it reviewed — on the
desk card or through `POST /workflows/runs/:runId/review`. The report goes out
at once, never silent; the inbox carries one `routine_review` decision; and the
next fire skips as overlap until the hold is released.

## Retired vocabulary

| Was | Now |
|---|---|
| "Routine = trigger + standing task" | A routine is its own record. It targets a **workflow** and produces runs. |
| "Every trigger materializes a task" | Every execution produces a **run**. Tasks are work items only. |
| "Standing task" | Gone. Nothing stands in for a job. |
| "Trigger" as a product noun | Wake sources are child rows on the routine (`ai.routine_triggers`). |
| "Routes durable work through Tasks, Goals, and Triggers" | Live work stays in chat. Recurring work is a **Routine**. A **Task** is a work item. |
| **Goal** as a work record above tasks | Gone. An outcome that needs more than one task is several **Tasks** with real `blocked_by_task_ids` dependencies. Nothing plans above them. |
| "Assignment *is* dispatch" | Assignment starts a run with the task as its subject; the task stays a work item. |
| Task checkout as a run mutex | Overlap is decided on the run. |
| **Action** as the published runnable | **Workflow**. Leftover `action*` in code is a migrate-me marker. |
| "Flow" as a product noun / catalog | **Workflow**. Flow is the internal graph JSON only. |
| Actions catalog vs Flows catalog | One catalog: **Workflows**. Provenance (module vs authored) is not a kind. |
| "Press has no routine" | Press fires the routine's **manual** trigger. |
| Heartbeat as a synonym for routine | The ticker is a *schedule*. `HEARTBEAT.md` is unrelated operating text. |
