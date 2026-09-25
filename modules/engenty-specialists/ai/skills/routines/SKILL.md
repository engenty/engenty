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

## Ask back first — one short message

When the person has not said what each run should leave (page, report or
table), ask before creating — and create nothing in that turn. Ask only
what is open, in one message with concrete options and your recommendation.

1. **When** — a time, an event, or a button.
2. **What each run leaves** (`result_format`):
   - `page` — structured text in Data (briefing, notes, summary).
   - `report` — an HTML report with layout, tables or charts (dashboard,
     management report).
   - `data` — rows in a Space table (leads, prices, metrics). If people want
     to see or edit them, offer an App on that table — built once now with
     `app_build`, never per run.
3. **Who hears** — notification, email, or nothing unless it fails.

Example: "Jeden Montag 8:00 — als Seite (empfohlen), als HTML-Bericht oder
als Tabelle mit App? Benachrichtigung dazu?"

## Where results live

- `page` / `report`: Data → Artifacts in this Space. The run answers with
  title and document, the platform stores it; the same title updates the
  same page. Put a date in the title for one page per day or week.
- `data`: a Space table. Create it once now (load **space-data**,
  `table_write` with columns), and name it in the prompt so every run adds
  to the same table.

## Before you create one

1. `routines_list` — you see your own (a coordinator sees the Space's).
   A routine that already covers the job gets changed, not duplicated.
2. If a Workflow could be the body, `workflows_list` in this turn and use
   only a returned id. Only `runnable: true` Workflows run.

## Prompt or Workflow

Pass exactly one of the two:

- **`prompt`** — you do the job **in one go**: research, read, write. Write
  it to yourself: the procedure, the sources, what the result must contain.
  Set `result_format`. Leave storing and notifying out — the platform stores
  the result and delivers it through the routine's destinations. Never write shell commands (`date`, `curl`, scripts) into it: every run already knows today's date and time, web research goes through `web_search` / `web_fetch`, and a command becomes an approval card with raw shell for the person. There is
  nothing to propose or publish.
- **`workflow_id`** — the job needs **an approval, a wait, a pass over many
  records, or several specialists** (draft → approve → send → chase). `workflow_propose` the graph first
  with `run_by: "routine"` and `owner_agent_id` yourself, then create the
  routine with its id. Creating the routine publishes the Workflow — on a
  card for the person where this Space asks one, on its own where it lets
  you decide. Do not go through the canvas for a job you could say in one
  paragraph.

## The fields

- `name` — what people will see on your desk.
- `outcomes` — the **deliveries**: each is what happens with a run's result,
  one box on the routine's flow: `{ provider_id, mode, config, description }`.
  `description` says in a few words what it is for ("Zusammenfassung an das
  Vertriebsteam"). "Notify me" / "Benachrichtigung" → `notification.high`
  (the bell and the Space dashboard); a quiet update → `notification.update`;
  email → `email` with `config.to`; linking the stored page →
  `artifact.pointer`. `mode: "always"` delivers every run, `"agent"` only
  when the run calls `outcomes_deliver`.
- `report` — the **fallback** for a routine without destinations:
  `desk_card` (default: a low-priority post on your desk, not on the bell),
  `quiet` (nothing; failures still report), `ask` (the result holds until a
  person marks it reviewed).
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
  `timezone`, `enabled`, `name`, `description`, `outcomes`, `report`,
  `quiet_hours`. Rebinding `workflow_id` works for a Workflow you own; a
  canvas Workflow's steps change through `workflow_self_revise`. Handing the
  job to someone else is management work — ask a coordinator.
- `routines_run` runs one now, skipping quiet hours. `disabled`,
  `quiet_hours` and `overlap` are answers, not errors.
- `duplicate` → change the routine the note names; do not retry with a
  shifted schedule or a new name.

## Say what you did

Report the routine's name, when it wakes, what each run leaves, and whether a
person still has to approve something. Claim nothing a tool result did not
return.
