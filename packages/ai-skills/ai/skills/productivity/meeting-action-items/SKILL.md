---
name: meeting-action-items
description: Turn meeting notes into Tasks with owners.
license: MIT
author: Ben Barclay (benbarclay), Hermes Agent, adapted for Engenty
allowed-tools: skill_search skill engenty_tools_search engenty_tool_execute artifact_write
metadata:
  engenty:
    category: productivity
    origin: hermes-agent skills/productivity/meeting-action-items
---

# Meeting action items

Turn notes into decisions, owners, and Tasks.

## When to Use

"Action items from the standup", "who owns follow-up", transcript or notes the user pasted.

## Procedure

1. Separate **decisions** (already resolved) from **actions** (still owed).
2. For each action: owner, due date if stated, quote or paraphrase with enough context to stand alone.
3. Confirm owners that were only implied ("we should…").
4. Create Tasks with `engenty_tools_search` / `engenty_tool_execute` (`tasks_create`). Do not open Notion, Teams, or a markdown dump.
5. Optionally `artifact_write` a short decision log for the Space.

## Pitfalls

- Treating every discussion point as a task.
- Defaulting the owner to the user in the chat without evidence.
- Using a vendor meeting pipeline that is not mounted in this Space.
