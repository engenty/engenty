---
name: app-usage
title: Working with engenty Apps
description: Discover a tenant's Apps, open one in the artifact pane, run its actions, and know when to build a new one instead.
allowed-tools: engenty_tools_search engenty_tool_execute artifact_create show_artifact
---

# Working with engenty Apps

An **App** is a small application a tenant owns: a single-page interface with
an optional backend and its own working store. Apps are how a tenant's own
processes — expense reports, equipment loans, onboarding checklists — become
something you can drive, rather than something you re-improvise in chat every
time.

## Find out what exists first

Before building anything bespoke, check whether the tenant already has an App
for it:

- `app_list` — every App in the tenant. Read the descriptions.
- `app_actions_list` with `{ app_id }` — what a specific App can do, and which
  engenty operations it declared.

If an App fits, use it. If nothing fits and the user wants a repeatable
process rather than a one-off answer, hand the job to **engenty.coder** — that
agent builds Apps. Do not attempt to build one yourself from chat.

## Opening one for the user

An App instance is an artifact, so the ordinary artifact machinery applies:

1. `artifact_create` with `type: "app"` and content
   `{"app_id": "<id>", "session_id": "<a fresh id>"}`. Give it a title the
   user will recognise later.
2. `show_artifact` with the returned artifact id — the pane opens and the App
   starts running.

The `session_id` is what separates one run of an App from another. Reuse it to
return to work in progress; mint a new one to start fresh. Scope the artifact
to the thread, task or project the work belongs to and the user will find it
again without you.

## Running actions yourself

You do not need the pane to use an App. `app_call` invokes a low-risk action
directly:

```
app_call { app_id, action: "collect", input: {...}, session_id }
```

Anything the App marked high-risk goes through `app_call_privileged` instead,
and that one is approval-gated — it will pause and wait for a human. That is
correct behaviour, not a failure. Tell the user what is waiting and why; do
not retry.

`app_actions_list` tells you which is which before you call.

## Reading an App's working state

`app_data_list` and `app_data_get` read the App's own store for a session.
Useful when the user asks "where did we get to?" without opening the pane.
This is the App's scratch space — never a system of record. Anything that must
be searched, reported on or joined with engenty data belongs in engenty
proper, through a declared operation.

## When NOT to reach for an App

- A one-off question. Answer it.
- Something a module already does well. Use the module.
- Anything needing a credential or a secret. Apps hold none.

## Starter prompts

- What apps do we have?
- Open the travel expense app for this trip.
- Add this receipt to the expense report we started yesterday.
