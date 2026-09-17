---
title: Inbox
description: Synced mail with triage lanes and search — and the agent operations the copilot uses.
---

# Inbox

Mail from your connected accounts, synced into Engenty so agents can read and
triage it without needing your mailbox open. Threads sit in status lanes, and
search covers the synced body text, not just subjects.

Connect an account first — see
[Connections](/docs/user/agent-operations/connections).

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

| Operation | | What it does |
| --- | --- | --- |
| `inbox_threads_list` | Reads | List threads (account filter, status lanes, paging) |
| `inbox_thread_get` | Reads | Get a thread with all of its messages |
| `inbox_message_search` | Reads | Search synced messages by sender, subject or body |
| `inbox_accounts_list` | Reads | List connected mail accounts and their sync state |
| `inbox_attachment_get` | Reads | Fetch an attachment for preview |
| `inbox_set_status` | Writes | Set the triage status of messages |
| `inbox_sync_run` | Writes | Run the sync now |
| `inbox_sync_settings_update` | Writes | Change per-account sync settings |

Reading and triaging happen here; **sending** mail is a connection operation
(`gmail_send_message`, `outlook_send_message`) and always asks first.
