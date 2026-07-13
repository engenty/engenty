-- Calendar sync (Phase 4): "All" vs "All future" push scope. When a user
-- enables sync they choose whether to push every scheduled entry or only
-- entries on/after a boundary date. NULL = All (no floor); a date = push only
-- entries with date >= backfill_from. Backfill and reconcile honor it.
alter table module_time_tracking.calendar_sync_state
  add column if not exists backfill_from date;
