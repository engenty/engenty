---
title: Memory
description: The operations behind what agents remember about you, your projects and your company.
---

# Memory

Agents keep a small set of durable notes — a preference you stated, a decision
on a project, a company-wide rule — and check them before acting. What that
covers, and how to review or correct it, is described in
[Agent memory](/user/memory). This page lists the operations behind it.

| Operation | | What it does |
| --- | --- | --- |
| `memory_record_list` | Reads | List memory records by scope, kind and status |
| `memory_record_search` | Reads | Search durable memories by content |
| `memory_record_upsert` | Writes | Save or update a memory record |
| `memory_record_approve` | Writes | Approve a proposed company-wide record |
| `memory_record_archive` | Writes | Archive a record so it drops out of recall |

Company-wide memories are **proposed**, not written directly — they wait for
someone to approve them, because a rule at that scope changes how every agent
behaves for everyone.

Archiving is the way to retire something an agent learned wrongly; it stops
being recalled without erasing the history that it was once believed.
