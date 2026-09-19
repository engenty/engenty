---
name: work-routing
title: Route live and durable work
description: Pick ONE lane — live, hire-agent, durable-work, or a published Workflow — when the request could be several. Loads at most one further skill; never stack lanes.
allowed-tools: engenty_tools_search engenty_tool_execute registry_agents_list message_agent workflows_list invoke_workflow requestDecision
---

# Work routing

Load this only when the lane is genuinely unclear. Pick ONE row, then act — at
most one further skill gets loaded, and hire-agent / durable-work are each
complete on their own.

| Need | Route |
| --- | --- |
| One bounded result while the human waits | Stay here: catalog operations, or `message_agent` to a mounted Engenty (live child run; creates nothing durable) |
| One bounded result a published Workflow already covers | `workflows_list`, then `invoke_workflow` with a returned runnable Workflow; `awaiting_approval` means report and stop |
| Hire, revise, or mount an Engenty — or a NEW recurring job with no exact owner | Load **hire-agent** (it also creates the Routine) |
| A Routine for an EXISTING mounted Engenty, one Task someone owns, or several linked Tasks for one outcome | Load **durable-work** |

Before acting, read the injected `current_space`; the injected mounted-ids list
is context, not a catalog — call the chosen lane's list operation in this turn,
and never reuse an id remembered from an earlier Space or turn.
