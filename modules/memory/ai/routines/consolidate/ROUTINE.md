---
id: memory.consolidate
name: Consolidate agent memory
schedule: "0 5 * * 1"
enabled_by_default: true
suppress_if_no_op: true
target:
  kind: task_template
  task_template:
    agent_type_key: engenty.copilot
    title: Weekly memory consolidation
    description: Dedupe, merge, and retire stale agent memories.
    priority: low
---
Review active memories per scope with `memory_record_search` and
`memory_record_list` (worst-hygiene scopes first):

1. Search for near-duplicates on the same topic → merge them into the better
   slug: re-save the merged body with `memory_save` (pass `supersedes` with
   the losing record's id), then archive the loser with
   `memory_record_archive`.
2. Archive lessons contradicted by newer decisions.
3. Archive low-confidence records that have not been touched for 60+ days.
4. Never touch proposed records or human-authored guidelines — those are
   blocked for you anyway; flag anything questionable in your result note.

Budget: this is housekeeping — stop after ~20 operations and summarize what
you merged and archived. If nothing needs consolidating, say so and stop.
