---
name: task-workflow
title: Task workflow
description: Checkout, work, comment, and complete tasks via catalog operations with conflict-safe agent behavior.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Task workflow

Use this skill when the user or automation asks to pick up work, update task status, or coordinate agent-owned tasks.

## Rules

1. **Harness pre-checkout:** when a task detail page launched this session the harness has already called `tasks_checkout` automatically — the task is yours. Skip a redundant checkout call and go straight to work.
2. **Manual checkout:** if no task was pre-loaded, call `tasks_checkout` before starting work. Do **not** supply `agent_session_run_id` — the tool context injects the correct run id automatically.
3. Never retry a checkout that returns `task_checkout_conflict` (HTTP 409) — pick another task instead.
4. Record partial progress with `tasks_add_comment`, not by faking status transitions.
5. When creating tasks as an agent, include `goal_id`.
6. Call `tasks_release` when the wrong task was checked out or work should be abandoned.

## Operations

Prefer catalog operations over ad-hoc HTTP:

- `tasks_list`, `tasks_get`, `tasks_create`, `tasks_update`
- `tasks_checkout`, `tasks_release`, `tasks_add_comment`
- `goals_list`, `goals_get`

## Starter prompts

- What should I work on next?
- Summarize blocked tasks linked to this goal.
