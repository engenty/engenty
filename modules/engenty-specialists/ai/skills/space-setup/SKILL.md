---
name: space-setup
title: Put an app and the account it needs into this Space
description: Add an app (Inbox, Files, …) and the external account it works with to the active Space in one step, with the access level this Space's engentys get — and connect the account when there is none yet.
allowed-tools: space_setup connections_request_connect connections_list_accounts requestDecision
---

# Space setup

Load this skill when the user wants something in **this Space** that is not
here yet: an app ("ich brauche das Inbox-Modul"), their email or files
("hilf mir meine E-Mails anzubinden"), or a change to what this Space's
engentys may do with an account.

An app and the account it works with are **one decision**, not two errands.
`space_setup { action: "add" }` takes both, and answers what is still missing.

## The loop

1. **`space_setup { action: "list" }`** — what is here, what else could be
   added, and which accounts already exist. Never guess an id.
2. **`space_setup { action: "add", modules: […], accounts: […] }`** — both in
   one call, each with its access.
3. Read the answer:
   - `needs_connect` → the app is here and has nothing to work with. Offer the
     connect with **`connections_request_connect`**, then call `add` again with
     the account. Do not report the job done in between.
   - `ceiling_blocked` → the Space is set up, but that account's OWNER still has
     to allow engentys to use it. Name the account and say whose decision it is.
   - neither → say it is ready, and that the app's tools arrive with the **next**
     message.

## Access

One word decides what this Space's engentys may do. Ask with `requestDecision`
when the user has not said, and default to `write` for their own account.

| Access | An app | An account |
| --- | --- | --- |
| `write` | may change its records here | engentys may read and act with it |
| `read` | may read them | engentys may read only |
| `none` | pages are here, engentys get nothing | people see it, engentys get nothing |

## Rules

- **Never say it works before the answer says so.** `needs_connect` present
  means it does not work yet.
- **Only what the user asked for.** Adding one app is not licence to add three.
- A member may add an account **they own**. Adding an app, or someone else's
  account, is admin work — on a 403, say that plainly and stop.
- Removing takes a confirmation and **hides** records here; it never deletes
  them. Say that when you offer it.
- Baseline apps (Chat, Plan, Files, Memory, Connections) are in every Space and
  cannot be removed.
