---
name: getting-started
title: Set Engenty up with a new person
description: First setup, one step per turn — each Space (personal, then team) gets its Chief of Staff, then the one to three apps and the account its work needs. Load when the person is new, the Space is empty, or they ask how to start.
allowed-tools: space_setup connections_request_connect registry_agents_list agent_propose agent_status requestDecision navigate
---

# Getting started

Load this when the person is new, asks how to begin ("wie fangen wir an",
"was machen wir am Anfang"), or the current Space has no hired Engenty and
only the baseline apps. It covers the whole first setup — load no lane skill
with it. A specialist beyond the Chief of Staff comes later, through
**hire-agent**, and only when the person names a job that keeps happening.

## Read the Space first

1. `current_space` in the runtime block: the person's **personal** Space
   (marked PERSONAL) or a **team** Space.
2. `registry_agents_list` — is there already a coordinator (a hire that
   reports to nobody)?
3. `space_setup { action: "list" }` — the apps and accounts here, and the apps
   that could be added. Never offer an app this list did not return.

## One step per turn

Each step ends on a tool result, not on a promise.

1. **Chief of Staff.** No coordinator yet → hire it with `agent_propose`
   (fields below). Do not ask what it should do; its mandate is fixed. Say in
   one sentence what it is for.
2. **What the Space is for.** One `requestDecision` with three to five
   directions that fit this Space and its available apps, for example:

   | Space | Directions |
   | --- | --- |
   | personal | E-Mail & Kalender · Aufgaben · Notizen & Wissen · Belege |
   | team | Kunden & Angebote · Projekte & Aufgaben · Finanzen · Team & Wissen |

3. **Apps and the account.** One `space_setup { action: "add" }` with the one
   to three apps for the chosen direction and the account they work with
   (`write` for the person's own account unless they say otherwise).
   `needs_connect` → offer `connections_request_connect`, then `add` again.
   The job is not done while `needs_connect` is in the answer.
4. **Set the apps up — lightly.** Only what an app cannot work without, which
   is usually the connected account. No sample data, no settings tour, no
   Routines, no extra apps "while we are at it". Then name the one next step
   in a line — typically: tell the Chief of Staff what should happen
   regularly.
5. **The other Space.** Personal done and the person works in a team Space
   too (or the reverse) → offer once to do the same there. The person
   switches; `navigate` to `/s/<key>` when they ask. The conversation follows
   them — the next turn's runtime block is the new Space.

## Chief of Staff fields

- `id`: `<space key>.chief-of-staff`; `name`: "Chief of Staff"; `engenty`:
  `round`;
- `description`: "Sets the space up, routes work, hires a teammate when a job
  deserves its own owner, and does what nobody else owns yet." — in the
  person's language;
- `instructions`: that mandate, plus "Load the **chief-of-staff** skill for
  setup, routing and hiring — it is your playbook here." (The playbook is the
  hire's, handed to it at run time; it is not in your catalog.)
- `for_work`: `chat`; `agent_scope`: `personal` in the personal Space,
  `shared` in a team Space; `tool_ids: []`, `skill_ids: []`.

No Routine — people talk to it.

## Rules

- At most three apps in the first setup. More only when the person asks.
- A chooser the person left unanswered is closed; do not ask it again unless
  they bring it up.
- Adding an app is admin work; on a 403 say so and stop.
- Report only what a tool result confirmed.
