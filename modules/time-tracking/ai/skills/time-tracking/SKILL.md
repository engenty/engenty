---
name: time-tracking
title: Time tracking
description: Load, log, update, and delete time entries for users, projects, phases, tasks, or manual tasks.
allowed-tools: engenty_tools_search engenty_tool_execute load_time_entries log_time_entry update_time_entry delete_time_entry tasks_list projects_list load_projects_list load_project navigate
---

# Time Tracking

Use this skill when the user wants to list logged time, log new hours, update existing entries, or delete time tracking entries.

## UI Context and Layout
* The time tracking screens in the application are organized by **week** in a **table** grid layout showing daily columns (Monday to Sunday).
* You can read the active UI view, display type, and currently visible week from the UI context (`page.view === "week"`, `page.display === "table"`, `page.current_week_start`).
* Make sure to represent logged time or changes to the user organized by day/week to match what they see in the table view.

## Tool Process
1. Read the UI context (`page` state) to know the user's active view, display layout, and selected week start date.
2. If the user refers to relative dates or weekdays, calculate the exact date YYYY-MM-DD first (see Date Resolution below).
3. If the user refers to a project, phase, or task name or identifier (e.g. `ENG-22`), resolve it to concrete UUIDs first (see Task & Project Resolution below).
4. Invoke the appropriate specialized tool: `load_time_entries`, `log_time_entry`, `update_time_entry`, or `delete_time_entry`.
5. Call the `navigate` tool to open `/mdl/time-tracking` once work is complete so the user can verify changes in the UI.

## Date Resolution Rules
* Look at the current time metadata from the system prompt or user message (e.g. `The current local time is: YYYY-MM-DD...`).
* Programmatically calculate the target `YYYY-MM-DD` date for any relative terms:
  * "today" ("heute") -> current local date.
  * "yesterday" ("gestern") -> current local date minus 1 day.
  * "tomorrow" ("morgen") -> current local date plus 1 day.
  * Weekdays ("Monday", "Montag", "Tuesday", "Dienstag", etc.) -> calculate the date of that weekday in the current week containing the local date. (Assume Monday is the first day of the week).
  * "this week" ("diese Woche") -> means logging entries for days within the current week's Monday-to-Sunday range.
* **Do NOT ask the user** for dates, years, or weeks if you can derive them from the current local time metadata. Perform the math and pass the clean `YYYY-MM-DD` string to the tool.

## Task & Project Resolution Rules
* If the user refers to a task by key or identifier (e.g., `ENG-22`, `PROJ-101`) or by title:
  1. Do **not** ask the user what it means or whether it is a project or task.
  2. Search for the task using the `tasks_list` tool with `{ "search": "<identifier-or-title>" }`.
  3. If a matching task is found:
     - Use its `id` as the `taskId`.
     - The task record contains a `project_id` and potentially context metadata like `phase_id`. Retrieve those to populate `projectId` and `phaseId`.
* If the user refers to a project by name (e.g., "Website launch"):
  1. Search for the project using `projects_list` or `load_projects_list` with `{ "search": "<project-name>" }`.
  2. If found, use its `id` as the `projectId`.
* Once you have resolved the structured IDs (`projectId`, `phaseId`, `taskId`), pass them to `log_time_entry`.
* If no matching project/task can be resolved from the system, only then fall back to manual titles: `manualProjectTitle` and `manualTaskTitle`.

## Log Time Entry
* Use `log_time_entry` to create a new log.
* Required inputs: `date` (YYYY-MM-DD string) and `hours` (positive number).
* If `userId` is not supplied, use the `current_user.id` resolved from `time_tracking_context_get`.

## Update Time Entry
* Always run `load_time_entries` first to find the existing entry and retrieve its `id`.
* Use `update_time_entry` to edit the hours, notes, or discipline.

## Delete Time Entry
* Always run `load_time_entries` first to find the entry and retrieve its `id`.
* Use `delete_time_entry` to delete it.
