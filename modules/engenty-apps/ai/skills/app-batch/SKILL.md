---
name: app-batch
title: Running Apps headlessly
description: Drive an engenty App from a routine or task run with no browser — including how approval pauses work and why the rules module is the point.
allowed-tools: engenty_tools_search engenty_tool_execute tasks_add_comment
---

# Running Apps headlessly

An App is not a UI with logic bolted on — it is a program that happens to have
a UI. Everything it does through actions, it does identically with no browser
present. That is what makes the monthly-batch pattern work.

## The pattern

A routine fires. In the task run:

1. `app_list` / `app_actions_list` — find the App and confirm the action ids.
   Never hardcode an action that the active version may have dropped.
2. `app_data_list` with the session you care about — what is already
   collected.
3. `app_call` for the low-risk work: validate, tally, prepare.
4. `app_call_privileged` for the one action that actually commits something.

Step 4 is where the run pauses.

## What an approval pause looks like

A high-risk action is approval-gated by contract. In a headless run the call
does not fail and does not silently succeed — the run parks, the task moves to
`blocked`, and a needs-input card appears in the inbox. A human approves
**once**, **for this task**, or **for this routine**, and the task
re-dispatches and passes the gate.

So:

- Do not treat a pause as an error. Do not retry it.
- Before pausing, write what you have done with `tasks_add_comment`. The
  person approving should be able to see the prepared result, not just the
  request.
- If the same routine pauses every month for the same action, suggest
  approving it **for this routine**. Suggest it; do not assume it.

## Why the rules module matters here

A well-built App keeps its tenant rules in one pure function that the frontend
and the batch both import. When you run headlessly you are executing the exact
same rules the user saw live in the pane — so a batch cannot quietly disagree
with what someone was shown yesterday.

If you find an App whose rules only exist in its page script, that is a defect
worth reporting: batch runs cannot enforce policy, and a second implementation
will appear. Say so rather than working around it.

## Preparing work for a human to step through

The strongest shape for a monthly run is not "do everything". It is:

1. Do all the deterministic work headlessly.
2. Leave the result in the App's store under a session the user can open.
3. Create the artifact (`type: "app"`, that same `session_id`) and say where
   it is.

The user opens one pane and steps through prepared items instead of starting
from nothing. Same App, same code, same rules — no browser needed for the part
that did not need one.

## Starter prompts

- Run the monthly expense batch.
- Prepare this month's report and leave it for me to review.
