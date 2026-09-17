---
title: Connections
description: Connecting Google, Microsoft, Slack and other accounts, and controlling what agents may do with them.
---

# Connections

A connection links an external account — Gmail, Outlook, Slack, Google Drive,
GitHub, S3 — to your Engenty workspace, so agents can work with it on your
behalf. You can connect several accounts per service and choose which one an
operation uses.

Find them at **Settings → Connections**.

## Controlling what agents may do

Connections carry their own permissions, separate from what the copilot can do
inside Engenty. For each action or group of actions you set a policy:

- **allow** — the agent may do it without asking
- **ask** — you are prompted each time
- **deny** — never

That is how "read my mail freely, but ask before sending" is expressed. Start
restrictive; you can widen a policy the first time a prompt gets tedious.

Disconnecting destroys the stored tokens.

| Operation | | What it does |
| --- | --- | --- |
| `connections_catalog` | Reads | List available services and your connection status |
| `connections_list_accounts` | Reads | List the connected accounts for a service |
| `connections_granted_operations` | Reads | Which operations you have durably allowed |
| `connections_storage_targets` | Reads | Connections that can store files |
| `connections_approvals_list` | Reads | Pending connection approval requests |
| `connections_request_connect` | Reads | Check connect state and offer a connect card |
| `connections_approvals_decide` | Writes | Approve or deny a pending request |
| `connections_set_policy` | Writes | Set an allow / ask / deny policy |
| `connections_update_settings` | Writes | Change sharing, autonomous mode or display name |
| `connections_disconnect` | Writes | Disconnect and delete a connection |
| `connections_files_write` | Writes | Write a file to a storage connection |

The operations for the connected services themselves — reading mail, creating
calendar events, posting to Slack — are listed under
[Connected services](/docs/user/agent-operations/connected-services).
