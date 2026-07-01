import type { ModuleLiveBinding } from "@engenty/live-cache";
import { timeTrackingKeys } from "./hooks/use-time-tracking.js";

/**
 * Reactive-data declaration for the time-tracking module. The global Supabase
 * Realtime mount invalidates the week query whenever a timesheet row or its
 * time entries change — regardless of writer — so the grid updates across
 * windows with no reload. Both tables are published to realtime (the grid reads
 * the relational `timesheet_rows`, with `time_entries` as its children).
 */
export const timeTrackingLiveBinding: ModuleLiveBinding = {
  id: "time-tracking",
  queryRoot: timeTrackingKeys.all,
  postgresChanges: [
    { schema: "module_time_tracking", table: "timesheet_rows" },
    { schema: "module_time_tracking", table: "time_entries" },
  ],
};
