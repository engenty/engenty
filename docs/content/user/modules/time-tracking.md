---
title: Time tracking
description: Timesheets, entries and saved reports, with calendar overlay and sync — and the agent operations the copilot uses.
---

# Time tracking

A weekly timesheet of **rows** (what you are working on) and **entries** (hours
on a day). Entries can be summarized by any dimension — person, project, client
— and a summary worth keeping becomes a **saved report**. Freezing a saved
report produces a **snapshot**: a point-in-time copy that stays put even as the
underlying hours change, which is what you send a client.

Calendars can be **overlaid** so you see your meetings while filling the sheet,
and optionally **synced** so entries are pushed back to a calendar.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

### Entries and rows

| Operation | | What it does |
| --- | --- | --- |
| `time_tracking_context_get` | Reads | Time-tracking context for the current user |
| `time_tracking_week_get` | Reads | Week rows and entries |
| `time_tracking_entries_list` | Reads | List entries in a date range, with filters |
| `time_tracking_entries_get` | Reads | Get a single entry |
| `time_tracking_entries_summarize` | Reads | Summarize hours grouped by a dimension |
| `time_tracking_entries_create` | Writes | Create time entry |
| `time_tracking_entries_update` | Writes | Update time entry |
| `time_tracking_entries_move` | Writes | Move an entry to another row or date |
| `time_tracking_entries_delete` | Writes | Delete time entry |
| `time_tracking_rows_create` | Writes | Create timesheet row |
| `time_tracking_rows_delete` | Writes | Delete timesheet row |

### Saved reports and snapshots

| Operation | | What it does |
| --- | --- | --- |
| `time_tracking_saved_reports_list` | Reads | List saved reports |
| `time_tracking_saved_reports_get` | Reads | Get a saved report |
| `time_tracking_saved_reports_create` | Writes | Create a saved report |
| `time_tracking_saved_reports_update` | Writes | Update a saved report |
| `time_tracking_saved_reports_delete` | Writes | Delete a saved report |
| `time_tracking_saved_report_snapshots_list` | Reads | List snapshots of a report |
| `time_tracking_saved_report_snapshots_get` | Reads | Get a snapshot |
| `time_tracking_saved_report_snapshots_create` | Writes | Freeze a point-in-time snapshot |
| `time_tracking_saved_report_snapshots_update` | Writes | Update a snapshot's label or as-of date |
| `time_tracking_saved_report_snapshots_delete` | Writes | Delete a snapshot |

### Calendars

| Operation | | What it does |
| --- | --- | --- |
| `time_tracking_calendar_events_list` | Reads | Overlay calendar events for a time window |
| `time_tracking_calendar_sources_list` | Reads | Calendars available to overlay |
| `time_tracking_calendar_sync_settings_get` | Reads | Read your calendar push-sync settings |
| `time_tracking_calendar_sync_settings_set` | Writes | Turn push sync on or off and pick the target calendar |
| `time_tracking_calendar_sync_run` | Writes | Reconcile calendar sync now |
