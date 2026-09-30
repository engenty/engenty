---
title: Connections
description: Connecting Google, Microsoft, Slack and other accounts, and controlling what agents may do with them.
---

# Connections

A connection links an external account — Gmail, Outlook, Slack, Google Drive,
GitHub, S3 — to a space in Engenty, so the agents working there can use it.
A space can hold several accounts per service; an operation names which one
it uses.

A **service** (Gmail, Notion, …) is the plugin. An **account** is the mailbox
or workspace you signed in with. Built-in services are always listed. Extra
services imported for your organization appear in every space of that
organization; they are not turned on in a space until someone adds them there.

## Accounts belong to a space, or to you

Every account belongs either to one space — the one it was connected in — or
to you.

- A **space's account** is used by every member and every specialist of that
  space; nobody outside the space can. Who signed in is recorded, but that
  gives them no extra rights. A space can enable the *service* before anyone
  authenticates; connecting then adds the account. To use the same mailbox in
  a second space, connect it there too.
- **Your own account** (your mail, your calendar, your browser extension) is
  used by you and your copilot, in any space. Specialists never use it, and
  nothing is synced from it into a space — your copilot reads it when you ask.
- A specialist can be limited to some of the services its space offers. It
  cannot use an account of another space.

Find your own accounts at **Settings → Connections**. A space's accounts are in
the space's setup.

## The copilot

The copilot is one private conversation that follows you. In a space it works
with that space's apps, accounts, computer and browser — plus your own
accounts, wherever you are. Outside every space it has your own accounts, but
no computer and no browser. So "read my mail and draft an offer in the client
space" works: the mail stays yours, only the offer lands in the space.

## Controlling what agents may do

Connections carry their own permissions, separate from what the copilot can do
inside Engenty. For each action or group of actions you set a policy:

- **allow** — the agent may do it without asking
- **ask** — you are prompted each time
- **deny** — never

That is how "read my mail freely, but ask before sending" is expressed. Start
restrictive; you can widen a policy the first time a prompt gets tedious.
Unattended runs (routines, background jobs) are further limited by the
account's autonomous mode. When an unattended run hits an **ask** action, the
request goes to the owners of the account's space (and tenant admins).

Only the owners of a space (and tenant admins) change an account's policies
and settings or disconnect it.

Disconnecting destroys the stored tokens.

Imported MCP plugins (a remote MCP server turned into a connector) are not the
same as Engenty's own MCP endpoint (`/mcp`), which lets *external* clients call
into Engenty.

| Operation | | What it does |
| --- | --- | --- |
| `connections_catalog` | Reads | List available services and the space's accounts |
| `connections_list_accounts` | Reads | List the space's accounts for a service |
| `connections_granted_operations` | Reads | Which operations you have durably allowed |
| `connections_storage_targets` | Reads | The space's connections that can store files |
| `connections_approvals_list` | Reads | Pending connection approval requests |
| `connections_request_connect` | Reads | Check connect state and offer a connect card |
| `connections_approvals_decide` | Writes | Approve or deny a pending request |
| `connections_set_policy` | Writes | Set an allow / ask / deny policy |
| `connections_update_settings` | Writes | Change autonomous mode or display name |
| `connections_disconnect` | Writes | Disconnect and delete a connection |
| `connections_files_write` | Writes | Write a file to a storage connection |

The operations for the connected services themselves — reading mail, creating
calendar events, posting to Slack — are listed under
[Connected services](/docs/user/agent-operations/connected-services).
