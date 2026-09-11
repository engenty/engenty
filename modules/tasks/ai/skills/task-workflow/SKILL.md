---
name: task-workflow
title: Task workflow
description: Bind a task to your run, work it, comment, and close it via catalog operations with conflict-safe agent behavior.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Task workflow

Use this skill when the user or automation asks to pick up work, update task status, or coordinate agent-owned tasks.

## Space scope

Tasks and routines are space-owned. List and create in `current_space`; never omit space scope in a Space-bound run. Child records inherit the parent Space.

## Rules

1. **You are in a run; the task is its subject.** When a task detail page launched this session the harness already bound the task to this run with `tasks_checkout` — it is yours. Skip a redundant call and go straight to work.
2. **Bind it yourself** when no task was pre-loaded: call `tasks_checkout` before starting work. Do **not** supply `agent_session_run_id` — the tool context injects this run's id automatically.
3. Overlap is decided on the run: a `task_checkout_conflict` (HTTP 409) means another run already has this task as its subject. Never retry it — pick another task instead.
4. Finishing your run does not finish the task. Move its status only when the work is actually done, and record partial progress with `tasks_add_comment` rather than faking a status transition.
5. Call `tasks_release` when the wrong task was bound or work should be abandoned.

## Operations

Prefer catalog operations over ad-hoc HTTP:

- `tasks_list`, `tasks_get`, `tasks_create`, `tasks_update`
- `tasks_checkout`, `tasks_release`, `tasks_add_comment`

## Starter prompts

- What should I work on next?
- Summarize blocked tasks in this list.
