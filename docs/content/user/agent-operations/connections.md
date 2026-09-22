---
title: Connections
description: Connecting Google, Microsoft, Slack and other accounts, and controlling what agents may do with them.
---

# Connections

A connection links an external account — Gmail, Outlook, Slack, Google Drive,
GitHub, S3 — to your Engenty workspace, so agents can work with it on your
behalf. You can connect several accounts per service and choose which one an
operation uses.

A **service** (Gmail, Notion, …) is the plugin. An **account** is the mailbox
or workspace you signed in with. Built-in services are always listed. Extra
services imported for your organization appear in every space of that
organization; they are not turned on in a space until someone adds them there
or grants an account to an agent.

Find connected accounts at **Settings → Connections**. Space setup can add an
account to the space you are in. A specialist's Capabilities tab can grant an
account to that agent, including the copilot.

## Where an account can be used

Who signed in owns the account. Where it may be used is separate — there is no
personal-versus-organization sharing toggle:

- **This space** — every specialist working here may use it, and so may the
  copilot while you are standing in that space. A space can enable the
  *service* before anyone authenticates; connecting then attaches the account.
- **Every space** — one flag on the account. Not a copy of the
  mount in each space.
- **This agent** — including your copilot. The account stays usable even when
  you are in a space that did not add it.

Those are a union: any one of them is enough. Your **personal space**
(`/s/me`) is a private workspace, not the old "personal sharing" setting.

## The copilot river

The copilot is one private conversation that follows you. It does not have a
separate thread per space.

When you are in a space, the copilot can use that space's enabled services and
shared accounts, **plus** any accounts you have given the copilot. When you
are not on a space route, it uses copilot-enabled accounts and accounts shared
with every space — not the company space and not `/s/me` by default.

## Controlling what agents may do

Connections carry their own permissions, separate from what the copilot can do
inside Engenty. For each action or group of actions you set a policy:

- **allow** — the agent may do it without asking
- **ask** — you are prompted each time
- **deny** — never

That is how "read my mail freely, but ask before sending" is expressed. Start
restrictive; you can widen a policy the first time a prompt gets tedious.
Unattended runs (routines, background jobs) are further limited by the
account's autonomous mode and, in a space, by that space's access level for
the account.

Disconnecting destroys the stored tokens.

Imported MCP plugins (a remote MCP server turned into a connector) are not the
same as Engenty's own MCP endpoint (`/mcp`), which lets *external* clients call
into Engenty.

| Operation | | What it does |
| --- | --- | --- |
| `connections_catalog` | Reads | List available services and your connection status |
| `connections_list_accounts` | Reads | List the connected accounts for a service |
| `connections_granted_operations` | Reads | Which operations you have durably allowed |
| `connections_storage_targets` | Reads | Connections that can store files |
| `connections_approvals_list` | Reads | Pending connection approval requests |
| `connections_request_connect` | Reads | Check connect state and offer a connect card |
| `connections_agent_grants_list` | Reads | Which agents may use which accounts |
| `connections_approvals_decide` | Writes | Approve or deny a pending request |
| `connections_set_policy` | Writes | Set an allow / ask / deny policy |
| `connections_update_settings` | Writes | Change all-spaces, autonomous mode or display name |
| `connections_agent_grant_set` | Writes | Let an agent use an account, or take it back |
| `connections_disconnect` | Writes | Disconnect and delete a connection |
| `connections_files_write` | Writes | Write a file to a storage connection |

The operations for the connected services themselves — reading mail, creating
calendar events, posting to Slack — are listed under
[Connected services](/docs/user/agent-operations/connected-services).
