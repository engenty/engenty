---
title: Remote channels
description: Reaching your agents from a messenger, and how an external identity is tied to your account.
---

# Remote channels

Remote channels let you talk to your agents from outside Engenty — from a
messenger — and let agents message you proactively when something needs you.

A **binding** connects a messenger channel to your workspace. Pairing is what
proves the person on the other end is you: you claim a pairing code from the
messenger account you want linked, and that becomes a verified identity. Any
identity can be revoked later.

| Operation | | What it does |
| --- | --- | --- |
| `remote_bindings_list` | Reads | List channel bindings |
| `remote_conversations_list` | Reads | List remote conversations |
| `remote_identities_list` | Reads | List verified external identities |
| `remote_pairing_info` | Reads | Inspect a pairing code before claiming it |
| `remote_bindings_upsert` | Writes | Create or update a binding |
| `remote_bindings_delete` | Writes | Delete a binding |
| `remote_identity_revoke` | Writes | Revoke an identity mapping |
| `remote_notify` | Writes | Post a proactive message into a bound thread |
| `remote_pairing_claim` | Writes | Claim a pairing code and link the identity |
| `remote_runtime_attach_thread` | Writes | Attach the Engenty thread backing a conversation |
| `remote_runtime_resolve_sender` | Writes | Resolve an inbound sender to a binding and identity |

Treat a pairing code like a password: whoever claims it is treated as you on
that channel. `remote_identity_revoke` is the undo.
