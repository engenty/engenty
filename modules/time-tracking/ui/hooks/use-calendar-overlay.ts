import { useQuery, useQueryClient } from "@engenty/query-client";
import { addDays, startOfDay } from "date-fns";
import { useCallback } from "react";
import {
  type CalendarSource,
  type CalendarSyncBackfillMode,
  type CalendarSyncSettings,
  getCalendarOverlayEvents,
  getCalendarSources,
  getCalendarSyncSettings,
  getCompanyOverlays,
  getOverlaySettings,
  type OverlayEvent,
  type OverlaySettings,
  type OverlayTarget,
  setCalendarSyncSettings,
  setOverlaySettings,
} from "../api.js";

const SETTINGS_KEY = ["time-tracking", "calendar-overlay", "settings"] as const;
const SYNC_KEY = ["time-tracking", "calendar-sync", "settings"] as const;
const COMPANY_KEY = ["time-tracking", "calendar-overlay", "company"] as const;

const EMPTY_SETTINGS: OverlaySettings = { enabled: false, targets: [] };
const EMPTY_SYNC: CalendarSyncSettings = {
  sync_enabled: false,
  connection_id: null,
  target_calendar_id: null,
  time_zone: null,
  backfill_from: null,
};

export interface SetSyncInput {
  backfill_mode?: CalendarSyncBackfillMode;
  connection_id: string;
  sync_enabled: boolean;
  target_calendar_id: string;
  time_zone?: string | null;
}

export interface UseCalendarOverlayResult {
  companyTargets: OverlayTarget[];
  events: OverlayEvent[];
  eventsLoading: boolean;
  hasErrors: boolean;
  setSettings: (next: OverlaySettings) => Promise<void>;
  setSyncSettings: (input: SetSyncInput) => Promise<void>;
  settings: OverlaySettings;
  sources: CalendarSource[];
  sourcesLoading: boolean;
  syncSettings: CalendarSyncSettings;
}

/**
 * Read-only external-calendar overlay for the time-tracking calendar. Events
 * are pulled live (no mirror store) for the whole visible week; `sources` (the
 * picker's connection/calendar catalog) load lazily, only when requested.
 */
export function useCalendarOverlay(
  weekStart: Date,
  sourcesEnabled: boolean
): UseCalendarOverlayResult {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: ({ signal }) => getOverlaySettings(signal),
  });
  const settings = settingsQuery.data ?? EMPTY_SETTINGS;

  // Window the full Mon–Sun week so span/weekend changes don't refetch.
  const timeMin = startOfDay(weekStart).toISOString();
  const timeMax = startOfDay(addDays(weekStart, 7)).toISOString();
  const targetKey = settings.targets
    .map(
      (target) => `${target.connection_id}:${target.calendar_id ?? "primary"}`
    )
    .join(",");

  const eventsQuery = useQuery({
    queryKey: [
      "time-tracking",
      "calendar-overlay",
      "events",
      timeMin,
      targetKey,
    ],
    queryFn: ({ signal }) =>
      getCalendarOverlayEvents(
        { time_min: timeMin, time_max: timeMax, calendars: settings.targets },
        signal
      ),
    enabled: settings.enabled && settings.targets.length > 0,
  });

  const sourcesQuery = useQuery({
    queryKey: ["time-tracking", "calendar-overlay", "sources"],
    queryFn: ({ signal }) => getCalendarSources(signal),
    enabled: sourcesEnabled,
    staleTime: 60_000,
  });

  const setSettings = useCallback(
    async (next: OverlaySettings) => {
      queryClient.setQueryData(SETTINGS_KEY, next);
      try {
        await setOverlaySettings(next);
      } finally {
        void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      }
    },
    [queryClient]
  );

  const syncQuery = useQuery({
    queryKey: SYNC_KEY,
    queryFn: ({ signal }) => getCalendarSyncSettings(signal),
  });

  // Tenant-suggested org calendars, loaded lazily alongside the picker.
  const companyQuery = useQuery({
    queryKey: COMPANY_KEY,
    queryFn: ({ signal }) => getCompanyOverlays(signal),
    enabled: sourcesEnabled,
    staleTime: 60_000,
  });

  const setSyncSettings = useCallback(
    async (input: SetSyncInput) => {
      const res = await setCalendarSyncSettings(input);
      queryClient.setQueryData(SYNC_KEY, res);
    },
    [queryClient]
  );

  return {
    settings,
    setSettings,
    events: settings.enabled ? (eventsQuery.data?.events ?? []) : [],
    eventsLoading: eventsQuery.isFetching,
    hasErrors: (eventsQuery.data?.errors?.length ?? 0) > 0,
    sources: sourcesQuery.data?.sources ?? [],
    sourcesLoading: sourcesQuery.isLoading,
    syncSettings: syncQuery.data ?? EMPTY_SYNC,
    setSyncSettings,
    companyTargets: companyQuery.data?.targets ?? [],
  };
}
