import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  createTimeEntry,
  deleteTimeEntry,
  ensureTaskCollaborator,
  moveTimeEntry,
  updateTimeEntry,
} from "../../api.js";
import { useCalendarOverlay } from "../../hooks/use-calendar-overlay.js";
import type {
  Discipline,
  ProjectOption,
  TimeEntry,
  TrackingRow,
} from "../types.js";
import { getTotalHoursForDay } from "../utils.js";
import {
  CalendarEntryDialog,
  type EntryDialogDraft,
  type EntryDialogResult,
} from "./calendar-entry-dialog.js";
import { CalendarGrid } from "./calendar-grid.js";
import { CalendarOverlayMenu } from "./calendar-overlay-menu.js";
import { CalendarSums } from "./calendar-sums.js";
import { CalendarTimeline } from "./calendar-timeline.js";
import {
  DAY_START_HOUR,
  entryColorKey,
  entryDurationMin,
  entryLabel,
  entryStartMin,
  formatHours,
  HOUR_PX,
  minutesToTime,
  projectColor,
  WEEKEND_COL_PX,
} from "./calendar-utils.js";

type Span = 7 | 3 | 1;

const SPAN_STORAGE_KEY = "engenty:time-tracking:calendar-span";
const WEEKEND_STORAGE_KEY = "engenty:time-tracking:calendar-weekend";
/** Below this main-area width the week view collapses Sat/Sun. */
const FULL_WEEK_MIN_PX = 1400;

function autoSpan(width: number): Span {
  if (width >= 900) {
    return 7;
  }
  if (width >= 560) {
    return 3;
  }
  return 1;
}

/**
 * Animation progress for the weekend expand/collapse (0 = collapsed,
 * 1 = expanded). Driven by rAF because browsers don't reliably interpolate
 * grid-template-columns; the column template is computed from this value.
 */
function useWeekendProgress(expanded: boolean) {
  const [progress, setProgress] = useState(expanded ? 1 : 0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const target = expanded ? 1 : 0;
    const from = progressRef.current;
    if (from === target) {
      return;
    }
    const startedAt = performance.now();
    const duration = 300;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt) / duration);
      const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      setProgress(from + (target - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    // rAF doesn't fire in hidden tabs — make sure the final state still lands.
    const failSafe = setTimeout(() => setProgress(target), duration + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failSafe);
    };
  }, [expanded]);

  return progress;
}

function loadSpanPref(): Span | "auto" {
  try {
    const raw = window.localStorage.getItem(SPAN_STORAGE_KEY);
    if (raw === "7" || raw === "3" || raw === "1") {
      return Number(raw) as Span;
    }
  } catch {
    // ignore
  }
  return "auto";
}

interface TimeTrackingCalendarProps {
  allProjects: ProjectOption[];
  currentWeek: Date;
  disciplines: Discipline[];
  isLoading: boolean;
  onWeekChange: (week: Date) => void;
  projectsAvailable: boolean;
  refetch: () => Promise<void>;
  tasksAvailable: boolean;
  timeEntries: TimeEntry[];
  trackingRows: TrackingRow[];
  userId: string;
}

export function TimeTrackingCalendar({
  allProjects,
  currentWeek,
  disciplines,
  isLoading,
  onWeekChange,
  projectsAvailable,
  refetch,
  tasksAvailable,
  timeEntries,
  trackingRows,
  userId,
}: TimeTrackingCalendarProps) {
  const { t, i18n } = useTranslation("time-tracking");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [spanPref, setSpanPref] = useState<Span | "auto">(() => loadSpanPref());
  const [scrollbarPad, setScrollbarPad] = useState(0);

  const weekStart = useMemo(
    () => startOfWeek(currentWeek, { weekStartsOn: 1 }),
    [currentWeek]
  );
  const todayIndex = useMemo(() => {
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      if (isSameDay(addDays(weekStart, i), today)) {
        return i;
      }
    }
    return -1;
  }, [weekStart]);

  const [focusIndex, setFocusIndex] = useState(() =>
    todayIndex >= 0 ? todayIndex : 0
  );

  const [weekendExpanded, setWeekendExpanded] = useState(() => {
    try {
      return window.localStorage.getItem(WEEKEND_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // External-calendar overlay (read-only background). Sources load lazily —
  // only while the picker is open — since listing calendars hits the provider.
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);
  const overlay = useCalendarOverlay(weekStart, overlayMenuOpen);

  const span: Span = spanPref === "auto" ? autoSpan(containerWidth) : spanPref;
  // In the narrow week the weekend is collapsible: all 7 day columns stay
  // mounted and only their track widths animate.
  const narrowWeek = span === 7 && containerWidth < FULL_WEEK_MIN_PX;
  const weekendCollapsed = narrowWeek && !weekendExpanded;
  const weekendProgress = useWeekendProgress(weekendExpanded);
  const startIndex = Math.min(Math.max(focusIndex, 0), 7 - span);
  const days = useMemo(
    () =>
      Array.from({ length: span }, (_, i) =>
        addDays(weekStart, startIndex + i)
      ),
    [weekStart, startIndex, span]
  );

  const toggleWeekend = (expanded: boolean) => {
    setWeekendExpanded(expanded);
    try {
      window.localStorage.setItem(WEEKEND_STORAGE_KEY, expanded ? "1" : "0");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver((observed) => {
      const width = observed[0]?.contentRect.width;
      if (width) {
        setContainerWidth(width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the fixed header/footer columns aligned with the scrollable grid.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    setScrollbarPad(el.offsetWidth - el.clientWidth);
  }, [days.length, isLoading]);

  // Start the day at a sensible working hour whenever the visible day range
  // changes (initial load, week navigation, span switch). Keyed on
  // weekStart + span so a weekend expand/collapse doesn't yank the scroll;
  // runs only once the real grid is mounted (the skeleton can't scroll).
  const scrollKey = `${format(weekStart, "yyyy-MM-dd")}:${span}`;
  const scrolledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (isLoading || !el || scrolledKeyRef.current === scrollKey) {
      return;
    }
    scrolledKeyRef.current = scrollKey;
    el.scrollTop = DAY_START_HOUR * HOUR_PX;
  }, [isLoading, scrollKey]);

  const setSpan = (next: Span | "auto") => {
    setSpanPref(next);
    try {
      if (next === "auto") {
        window.localStorage.removeItem(SPAN_STORAGE_KEY);
      } else {
        window.localStorage.setItem(SPAN_STORAGE_KEY, String(next));
      }
    } catch {
      // ignore
    }
  };

  const navigate = (direction: 1 | -1) => {
    const next = startIndex + direction * span;
    if (next < 0) {
      onWeekChange(subWeeks(currentWeek, 1));
      setFocusIndex(7 - span);
    } else if (next > 7 - span) {
      onWeekChange(addWeeks(currentWeek, 1));
      setFocusIndex(0);
    } else {
      setFocusIndex(next);
    }
  };

  const goToday = () => {
    const today = new Date();
    onWeekChange(today);
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    // Calendar-day difference, not a ms/86400000 rounding (which lands on the
    // next day every afternoon and can drift across DST).
    setFocusIndex(differenceInCalendarDays(today, monday));
  };

  // --- optimistic overrides + saving state ----------------------------------
  const [overrides, setOverrides] = useState<
    Record<string, Partial<TimeEntry>>
  >({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const renderedEntries = useMemo(
    () =>
      timeEntries.map((entry) =>
        overrides[entry.id] ? { ...entry, ...overrides[entry.id] } : entry
      ),
    [timeEntries, overrides]
  );

  const runEntryMutation = useCallback(
    async (
      entryId: string,
      override: Partial<TimeEntry>,
      mutate: () => Promise<unknown>
    ) => {
      setOverrides((prev) => ({ ...prev, [entryId]: override }));
      setSavingIds((prev) => new Set(prev).add(entryId));
      try {
        await mutate();
        await refetch();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("calendar.saveFailed")
        );
      } finally {
        setOverrides((prev) => {
          const { [entryId]: _removed, ...rest } = prev;
          return rest;
        });
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(entryId);
          return next;
        });
      }
    },
    [refetch, t]
  );

  const handleMoveEntry = useCallback(
    (entry: TimeEntry, day: Date, startMin: number) => {
      const date = format(day, "yyyy-MM-dd");
      const start_time = minutesToTime(startMin);
      void runEntryMutation(entry.id, { date, start_time }, () =>
        moveTimeEntry(entry.id, { date, start_time })
      );
    },
    [runEntryMutation]
  );

  const handleResizeEntry = useCallback(
    (entry: TimeEntry, startMin: number, durationMin: number) => {
      const start_time = minutesToTime(startMin);
      const hours = durationMin / 60;
      void runEntryMutation(entry.id, { hours, start_time }, () =>
        updateTimeEntry(entry.id, { hours, start_time })
      );
    },
    [runEntryMutation]
  );

  // --- dialog ----------------------------------------------------------------
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDialogDraft | null>(null);

  const handleCreateRange = useCallback(
    (day: Date, startMin: number, durationMin: number) => {
      setDraft({ date: format(day, "yyyy-MM-dd"), durationMin, startMin });
      setDialogOpen(true);
    },
    []
  );

  const handleOpenEntry = useCallback((entry: TimeEntry) => {
    setDraft({
      date: entry.date,
      durationMin: entryDurationMin(entry),
      entry,
      startMin: entryStartMin(entry),
    });
    setDialogOpen(true);
  }, []);

  const handleDialogSubmit = useCallback(
    async (result: EntryDialogResult) => {
      const entry = draft?.entry;
      if (entry) {
        const dateChanged = result.date !== entry.date;
        const identityChanged = result.identity !== null;
        const startChanged =
          (result.start_time ?? null) !== (entry.start_time ?? null);
        if (dateChanged || identityChanged) {
          await moveTimeEntry(entry.id, {
            date: result.date,
            discipline: result.discipline,
            start_time: result.start_time,
            ...(result.identity ?? {}),
          });
          await updateTimeEntry(entry.id, {
            hours: result.hours,
            notes: result.notes,
          });
        } else {
          await updateTimeEntry(entry.id, {
            discipline: result.discipline,
            hours: result.hours,
            notes: result.notes,
            ...(startChanged ? { start_time: result.start_time } : {}),
          });
        }
      } else {
        if (!result.identity) {
          return;
        }
        await createTimeEntry({
          date: result.date,
          discipline: result.discipline,
          hours: result.hours,
          notes: result.notes,
          start_time: result.start_time,
          user_id: userId,
          ...result.identity,
        });
        if (result.taskId) {
          ensureTaskCollaborator(result.taskId, userId).catch(() => {
            // best effort, same as the table flow
          });
        }
      }
      await refetch();
    },
    [draft, refetch, userId]
  );

  const handleDeleteEntry = useCallback(
    async (entry: TimeEntry) => {
      await deleteTimeEntry(entry.id);
      await refetch();
    },
    [refetch]
  );

  // --- derived ---------------------------------------------------------------
  const unscheduledByDay = useMemo(
    () =>
      days.map((day) =>
        renderedEntries.filter(
          (entry) => !entry.start_time && isSameDay(parseISO(entry.date), day)
        )
      ),
    [days, renderedEntries]
  );
  const hasUnscheduled = unscheduledByDay.some((list) => list.length > 0);

  const rangeLabel = useMemo(() => {
    const first = days[0];
    const last = days.at(-1) ?? first;
    if (span === 1) {
      return new Intl.DateTimeFormat(i18n.language, {
        day: "numeric",
        month: "long",
        weekday: "long",
        year: "numeric",
      }).format(first);
    }
    const dayMonth = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "long",
    });
    const dayMonthYear = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return `${dayMonth.format(first)} – ${dayMonthYear.format(last)}`;
  }, [days, span, i18n.language]);

  const weekendHours = useMemo(
    () =>
      narrowWeek
        ? [addDays(weekStart, 5), addDays(weekStart, 6)].reduce(
            (sum, day) => sum + getTotalHoursForDay(day, renderedEntries),
            0
          )
        : 0,
    [narrowWeek, weekStart, renderedEntries]
  );

  const isDayCollapsed = (index: number) => weekendCollapsed && index >= 5;

  const headerPad = { paddingRight: scrollbarPad };
  const innerWidth = Math.max(0, containerWidth - 2 - scrollbarPad - 48);
  const stripW = (1 - weekendProgress) * WEEKEND_COL_PX;
  const weekendW = weekendProgress * (innerWidth / 7);
  const weekdayW = Math.max(0, (innerWidth - 2 * weekendW - stripW) / 5);
  const gridTemplateColumns = narrowWeek
    ? `48px ${new Array(5).fill(`${weekdayW}px`).join(" ")} ${weekendW}px ${weekendW}px ${stripW}px`
    : `48px repeat(${days.length}, minmax(0, 1fr))`;
  const gridTemplate = { gridTemplateColumns };
  const animatedGrid = "grid";

  return (
    <div className="flex min-w-0 flex-col" ref={containerRef}>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => navigate(-1)} size="icon-sm" variant="outline">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button onClick={() => navigate(1)} size="icon-sm" variant="outline">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button onClick={goToday} size="sm" variant="outline">
          {t("today")}
        </Button>
        <div className="font-semibold text-sm sm:text-base">{rangeLabel}</div>
        <div className="ml-auto flex items-center gap-2">
          <CalendarOverlayMenu
            companyTargets={overlay.companyTargets}
            hasErrors={overlay.hasErrors}
            onOpenChange={setOverlayMenuOpen}
            onSettingsChange={overlay.setSettings}
            onSyncChange={overlay.setSyncSettings}
            open={overlayMenuOpen}
            settings={overlay.settings}
            sources={overlay.sources}
            sourcesLoading={overlay.sourcesLoading}
            syncSettings={overlay.syncSettings}
          />
          <div className="flex items-center rounded-md border p-0.5">
            {([7, 3, 1] as Span[]).map((value) => (
              <button
                className={[
                  "rounded px-2 py-0.5 text-xs transition-colors",
                  span === value
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                key={value}
                onClick={() => setSpan(value)}
                type="button"
              >
                {t(`calendar.span${value}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar frame ──────────────────────────────────── */}
      <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-lg border bg-card">
        {/* Day headers */}
        <div className="border-b" style={headerPad}>
          <div className={animatedGrid} style={gridTemplate}>
            <div />
            {days.map((day, index) => {
              const isToday = isSameDay(day, new Date());
              const collapsed = isDayCollapsed(index);
              const showCollapseToggle =
                narrowWeek && !weekendCollapsed && index === days.length - 1;
              return (
                <div
                  className={[
                    "relative min-w-0 overflow-hidden border-l first-of-type:border-l-0",
                    "transition-opacity duration-300",
                    collapsed
                      ? "pointer-events-none border-l-transparent opacity-0"
                      : "opacity-100",
                  ].join(" ")}
                  key={format(day, "yyyy-MM-dd")}
                >
                  <button
                    className="group flex w-full flex-col items-center gap-0 py-1.5"
                    onClick={() => {
                      if (span > 1) {
                        setSpan(1);
                        setFocusIndex(startIndex + index);
                      }
                    }}
                    tabIndex={collapsed ? -1 : undefined}
                    type="button"
                  >
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {new Intl.DateTimeFormat(i18n.language, {
                        weekday: "short",
                      }).format(day)}
                    </span>
                    <span
                      className={[
                        "flex h-6 w-6 items-center justify-center rounded-full font-semibold text-sm",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground group-hover:bg-accent",
                      ].join(" ")}
                    >
                      {format(day, "d")}
                    </span>
                  </button>
                  {showCollapseToggle ? (
                    <button
                      aria-label={t("calendar.collapseWeekend")}
                      className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => toggleWeekend(false)}
                      title={t("calendar.collapseWeekend")}
                      type="button"
                    >
                      <ChevronsLeft className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {narrowWeek ? (
              <button
                aria-label={t("calendar.expandWeekend")}
                className={[
                  "flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden border-l bg-muted/30 py-1.5 text-muted-foreground",
                  "transition-opacity duration-300 hover:bg-accent hover:text-foreground",
                  weekendCollapsed
                    ? "opacity-100"
                    : "pointer-events-none opacity-0",
                ].join(" ")}
                onClick={() => toggleWeekend(true)}
                tabIndex={weekendCollapsed ? undefined : -1}
                title={t("calendar.expandWeekend")}
                type="button"
              >
                <ChevronsRight className="h-3 w-3" />
                <span className="text-[9px] uppercase leading-none tracking-wide">
                  {new Intl.DateTimeFormat(i18n.language, {
                    weekday: "narrow",
                  }).format(addDays(weekStart, 5))}
                  ·
                  {new Intl.DateTimeFormat(i18n.language, {
                    weekday: "narrow",
                  }).format(addDays(weekStart, 6))}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Project timeline lane */}
        <div style={headerPad}>
          <CalendarTimeline
            days={days}
            entries={renderedEntries}
            gridTemplateColumns={gridTemplateColumns}
            trackingRows={trackingRows}
          />
        </div>

        {/* Unscheduled entries (no start time yet) */}
        {hasUnscheduled && (
          <div className="border-b bg-muted/20" style={headerPad}>
            <div className={animatedGrid} style={gridTemplate}>
              <div className="px-1 py-1 text-right text-[9px] text-muted-foreground uppercase leading-tight tracking-wide">
                {t("calendar.unscheduled")}
              </div>
              {days.map((day, index) => (
                <div
                  className={[
                    "flex min-w-0 flex-wrap gap-1 overflow-hidden border-l px-1 py-1 first-of-type:border-l-0",
                    "transition-opacity duration-300",
                    isDayCollapsed(index)
                      ? "pointer-events-none border-l-transparent opacity-0"
                      : "opacity-100",
                  ].join(" ")}
                  key={format(day, "yyyy-MM-dd")}
                >
                  {unscheduledByDay[index].map((entry) => {
                    const label = entryLabel(entry, trackingRows);
                    const color = projectColor(
                      entryColorKey(entry, trackingRows)
                    );
                    return (
                      <button
                        className="inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors hover:bg-accent"
                        key={entry.id}
                        onClick={() => handleOpenEntry(entry)}
                        title={`${label.title} · ${formatHours(Number(entry.hours))}`}
                        type="button"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate">{label.title}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatHours(Number(entry.hours))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {narrowWeek ? <div className="border-l" /> : null}
            </div>
          </div>
        )}

        {/* Scrollable time grid */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
          ref={scrollerRef}
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-32 w-2/3 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : (
            <CalendarGrid
              days={days}
              entries={renderedEntries}
              gridTemplateColumns={gridTemplateColumns}
              onCreateRange={handleCreateRange}
              onMoveEntry={handleMoveEntry}
              onOpenEntry={handleOpenEntry}
              onResizeEntry={handleResizeEntry}
              overlayEvents={overlay.events}
              savingEntryIds={savingIds}
              trackingRows={trackingRows}
              weekend={
                narrowWeek
                  ? {
                      collapsed: weekendCollapsed,
                      hours: weekendHours,
                      onExpand: () => toggleWeekend(true),
                    }
                  : null
              }
            />
          )}
        </div>

        {/* Sums footer (same totals as the table view) */}
        <div style={headerPad}>
          <CalendarSums
            days={days}
            gridTemplateColumns={gridTemplateColumns}
            weekEntries={renderedEntries}
            weekend={
              narrowWeek
                ? { collapsed: weekendCollapsed, hours: weekendHours }
                : null
            }
          />
        </div>
      </div>

      <CalendarEntryDialog
        allProjects={allProjects}
        disciplines={disciplines}
        draft={draft}
        onDelete={handleDeleteEntry}
        onOpenChange={setDialogOpen}
        onSubmit={handleDialogSubmit}
        open={dialogOpen}
        projectsAvailable={projectsAvailable}
        tasksAvailable={tasksAvailable}
        timeEntries={timeEntries}
        trackingRows={trackingRows}
      />
    </div>
  );
}
