-- Optional start time for calendar placement of time entries.
-- Entries without a start_time remain valid (table view / unscheduled lane).
alter table module_time_tracking.time_entries
  add column if not exists start_time time;
