---
title: Agent operations
description: What the copilot can do beyond any single module — search, connections, secrets, apps, remote channels and the browser.
---

# Agent operations

Most of what the copilot does belongs to a [module](/user/modules). The rest is
here: the capabilities it has everywhere, regardless of which screen you are on.

- **[Workspace search](/user/agent-operations/search)** — one search across everything indexed, plus the catalog the copilot uses to find its own tools.
- **[Connections](/user/agent-operations/connections)** — linking Google, Microsoft, Slack and others, and setting what agents may do with them.
- **[Connected services](/user/agent-operations/connected-services)** — what agents can actually do inside those accounts.
- **[Secrets](/user/agent-operations/secrets)** — credentials agents can use without you pasting them into chat.
- **[Apps](/user/agent-operations/apps)** — small tools an agent can build, release and run.
- **[Remote channels](/user/agent-operations/remote-channels)** — reaching your agents from a messenger.
- **[Browser](/user/agent-operations/browser)** — driving a real browser for things with no API.

## Reads, writes and approvals

Every operation is either a **read** or a **write**. Reads never change
anything, so agents run them freely — that is why the copilot can answer
questions about your data without asking permission first.

Writes are different. Some run directly (creating a draft, adding a comment);
the ones that carry real consequence are **approval-gated** and stop to ask you,
showing exactly what they are about to do. Issuing an invoice, changing a tax
rate, and deleting a template all work this way.

Connections add a second layer on top: even an allowed operation can be set to
**ask** or **deny** per service, so "read my mail, but ask before sending" is
something you configure once.

## A note on how agents write

Agents change your data through these operations and nothing else. They do not
fill in forms or click buttons on your behalf — an operation validates its
input, reports what actually changed, and can be approved and audited, while a
click can do none of those things.

So if the copilot tells you something was saved, an operation returned success.
If it cannot do something, it will say which operations exist instead of
half-doing it through the interface.
