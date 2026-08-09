---
title: Secrets
description: Encrypted credentials agents can use without you pasting them into chat.
---

# Secrets

Somewhere to put API keys and credentials so an agent can use them without them
ever appearing in a conversation. Values are encrypted at rest, and reading one
back is audited.

| Operation | | What it does |
| --- | --- | --- |
| `secrets_list` | Reads | List secret metadata you have access to |
| `secrets_create` | Writes | Create an encrypted secret |
| `secrets_update` | Writes | Update metadata or the value |
| `secrets_move` | Writes | Re-home a secret to a different owner |
| `secrets_reveal` | Writes | Decrypt and return the value — audited |
| `secrets_delete` | Writes | Delete a secret |

Note that `secrets_list` returns **metadata only** — names and ownership, never
values. `secrets_reveal` is the only operation that decrypts, it is recorded
every time, and agent access to it is gated separately.

Never paste a credential into chat to "give" it to an agent. Put it here and
tell the agent which secret to use.
