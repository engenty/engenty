---
name: inbox-reply-and-send
title: Reply and send email
description: Draft and send email at the provider via connections connector actions, with drafts-first and approval-aware behavior.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Reply and send email

Use this skill when the user wants to answer a message, draft a reply, or send a
new email. Inbox tools cannot send mail — composing happens at the provider
through connections connector actions.

## Finding the tools

Discover what is granted with `engenty_tools_search` and run it with
`engenty_tool_execute`. Tool names are `<prefix>_<action>` per connected account:

- Gmail (`gmail_*`): `gmail_create_draft`, `gmail_send_message`,
  `gmail_modify_labels`, `gmail_trash_message`, plus reads.
- Outlook (`outlook_*`): `outlook_create_draft` (draft only — Outlook currently
  has **no send action**; the user sends the draft from their mail client).

If a compose tool is not in the catalog, the action is not granted for that
connection — say so; do not improvise another path.

## Composing

Compose inputs are `to` (list), optional `cc`, `subject`, `body_text`
(plain text). There is **no thread id or reply header**: a "reply" is a new
message addressed to the original sender. Build it from the synced message
(`inbox_get_thread`): recipient = `from_email`, subject = `Re: <subject>` (keep
an existing `Re:` prefix as-is). The provider may or may not thread it — do not
promise the reply will appear inside the original conversation.

## Workflow

1. Read the thread being answered (`inbox_get_thread`) so the reply reflects
   what was actually written.
2. Draft the body and show the user the exact outgoing text: recipients,
   subject, body.
3. Default to `*_create_draft` — the user reviews and sends from their mail
   client. Call `gmail_send_message` only when the user explicitly said to send
   and has seen the final text.
4. After a send/draft call, report the result (`draft_id` / `sent`) and update
   mailbox status: `inbox_set_status` → `read` (or `archived` if the user wants
   it out of the way) for the answered message(s).

## Rules

- Drafts first; sending is irreversible and delivers immediately.
- Connector actions are per-connection policy-gated and may suspend for human
  approval — tell the user an approval is pending and stop; never retry or try
  to bypass a pending approval.
- Never send content the user has not seen in this conversation.
- Do not compose replies to content you have not read via a tool this turn.
- With multiple connected accounts, confirm which account sends (the tool's
  connection/account choice) before drafting.

## Starter prompts

- Reply to this email.
- Draft an answer to <sender> about <topic>.
- Send a follow-up on the invoice thread.
