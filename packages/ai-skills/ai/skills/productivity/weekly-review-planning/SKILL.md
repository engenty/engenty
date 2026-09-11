---
name: weekly-review-planning
description: "Weekly reset: stalled work and next-week Tasks."
license: MIT
author: Ben Barclay (benbarclay), Hermes Agent, adapted for Engenty
allowed-tools: skill_search skill engenty_tools_search engenty_tool_execute
metadata:
  engenty:
    category: productivity
    origin: hermes-agent skills/productivity/weekly-review-planning
---

# Weekly review and planning

A weekly reset: what moved, what stalled, what happens next week.

## When to Use

Friday/Monday reviews, "plan my week", or catching stalled Tasks in this Space.

## Procedure

1. List open work with catalog ops (`tasks_list` / `tasks_get` via `engenty_tools_search` then `engenty_tool_execute`). Stay inside the current Space.
2. Group: done this week, still in flight, stalled (no movement / blocked), committed-but-not-started.
3. Propose a next-week plan: keep, defer, or split. Do not invent calendar events unless a calendar tool is actually available.
4. Apply updates the user approves (`tasks_update`). Create new Tasks only for work they accept.
5. Summarize in chat; do not write an Obsidian/Notion weekly note unless they asked for an artifact.

## Pitfalls

- Reviewing the whole tenant instead of this Space.
- Closing stalled work without asking.
- Dumping a markdown plan on disk instead of updating Tasks.
