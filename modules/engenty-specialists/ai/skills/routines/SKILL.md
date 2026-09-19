---
name: routines
title: Your routines — standing jobs that run on their own
description: A routine is a job that runs without being asked — a wake source (a schedule, a module event, a button) plus what each run must achieve. Load it when someone asks for something on a schedule, whenever something happens, or "from now on"; to list, create, change or run your own routines; or to decide whether a job needs a Workflow.
license: MIT
allowed-tools: routines_list routines_create routines_update routines_run workflows_list workflow_propose invoke_workflow requestDecision
metadata:
  engenty:
    category: spaces
---

# Routines

A routine is **your standing job**: what wakes it, what each run does, and
what done looks like. Each wake starts a run on your desk — no Task, no card
someone has to close. You are complete without one; a routine is how you also
work when nobody is talking to you.

A request is a routine when it says **when** or **whenever**, not only
**what**: "jeden Freitag um 8 einen Report", "sobald ein Kontakt angelegt
wird", "ab jetzt jeden Morgen". One-off work stays in this conversation.

## Before you create one

1. `routines_list` — you see your own (a coordinator sees the Space's).
   A routine that already covers the job gets changed, not duplicated.
2. If a Workflow could be the body, `workflows_list` in this turn and use
   only a returned id. Only `runnable: true` Workflows run.

## Prompt or Workflow

Pass exactly one of the two:

- **`prompt`** — the job is **one step**: read this, write that, post the
  result. Write it to yourself: the procedure, the sources, where the result
  lands, what to report. The server keeps a one-node Workflow for it; there is
  nothing to propose or publish.
- **`workflow_id`** — the job has **more than one step, an approval, or a
  wait** (draft → approve → send → chase). `workflow_propose` the graph first
  with `run_by: "routine"` and `owner_agent_id` yourself, then create the
  routine with its id. Creating the routine publishes the Workflow — on a
  card for the person where this Space asks one, on its own where it lets
  you decide. Do not go through the canvas for a job you could say in one
  paragraph.

## The fields

- `name` — what people will see on your desk.
- `outcome` — **the promise**: what a run must have achieved to count as
  done. One or two sentences. A run is judged by it.
- `report` — how loud a run lands: `desk_card` (default: the result posts on
  your desk), `quiet` (nothing; failures still report), `ask` (the result
  holds until a person marks it reviewed).
- Wake source, by `kind`:
  - `schedule`: `cron` + IANA `timezone` in the person's local clock ("07:00
    Vienna" = `cron: "0 7 * * *", timezone: "Europe/Vienna"`). Never convert
    to UTC.
  - `event`: `provider_id: "module-events"` + `resource` (the event name,
    e.g. `contacts.contact.created`, or a Space table row event
    `ai.data_table.row.created` pinned with `event_filter: { table_id }`).
  - `manual` / `agent`: nothing wakes it by itself — a person presses it or
    asks for it. Use these for a job that must exist but must not run alone;
    never invent a cron to fill the field.
- `quiet_hours` — a UTC window scheduled fires skip, `"HH:MM-HH:MM"`.
- `approval_grants` — operation ids a fire may run **without asking**. A
  scheduled run has nobody to ask at 03:00: without a grant it parks on the
  first gated write. Name only what the job actually does. A person always
  confirms grants on a card.

Omit `agent_id`: the routine is yours. Only a coordinator or the copilot can
give a job to someone else.

## Who says yes

Whether a person confirms first is the Space's setting, not your choice —
the call may **pause on a card** (create, or publish + create). When it does,
report what the person answered; never claim the routine exists before the
result says `created`. Set **`ask_first: true`** when you would want a
confirmation anyway: the job is ambiguous, it writes records, or it was
implied rather than asked for.

If the result is `refused` because nobody in this run can answer a card, do
what the note says: hand the job to the named coordinator with
`message_agent`, or tell the person to ask from a chat.

## Changing and running your routines

- `routines_update` on your own routine: `prompt` (re-brief), `cron`,
  `timezone`, `enabled`, `name`, `description`, `outcome`, `report`,
  `quiet_hours`. Rebinding `workflow_id` works for a Workflow you own; a
  canvas Workflow's steps change through `workflow_self_revise`. Handing the
  job to someone else is management work — ask a coordinator.
- `routines_run` runs one now, skipping quiet hours. `disabled`,
  `quiet_hours` and `overlap` are answers, not errors.
- `duplicate` → change the routine the note names; do not retry with a
  shifted schedule or a new name.

## Say what you did

Report the routine's name, when it wakes, what done means, and whether a
person still has to approve something. Claim nothing a tool result did not
return.
