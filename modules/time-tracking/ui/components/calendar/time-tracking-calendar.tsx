import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import {
  addDays,
  addWeeks,
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
  const [spanPref, setSpanPref] = useState<Span | "auto">(() =>
    loadSpanPref()
  );
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

  const span: Span = spanPref === "auto" ? autoSpan(containerWidth) : spanPref;
  const narrowWeek = span === 7 && containerWidth < FULL_WEEK_MIN_PX;
  const workweek = narrowWeek && !weekendExpanded;
  const startIndex = Math.min(Math.max(focusIndex, 0), 7 - span);
  const dayCount = workweek ? 5 : span;
  const days = useMemo(
    () =>
      Array.from({ length: dayCount }, (_, i) =>
        addDays(weekStart, (workweek ? 0 : startIndex) + i)
      ),
    [weekStart, startIndex, dayCount, workweek]
  );
  const weekendDays = useMemo(
    () =>
      workweek ? [addDays(weekStart, 5), addDays(weekStart, 6)] : null,
    [workweek, weekStart]
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

  // Start the day at a sensible working hour, once the real grid is in place
  // (while loading the scroller only contains the skeleton and cannot scroll).
  const didInitialScroll = useRef(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (isLoading || didInitialScroll.current || !el) {
      return;
    }
    didInitialScroll.current = true;
    el.scrollTop = DAY_START_HOUR * HOUR_PX;
  }, [isLoading]);

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
    onWeekChange(new Date());
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    setFocusIndex(
      Math.round((today.getTime() - monday.getTime()) / 86_400_000)
    );
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
          (entry) =>
            !entry.start_time && isSameDay(parseISO(entry.date), day)
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
      weekendDays
        ? weekendDays.reduce(
            (sum, day) => sum + getTotalHoursForDay(day, renderedEntries),
            0
          )
        : 0,
    [weekendDays, renderedEntries]
  );

  const headerPad = { paddingRight: scrollbarPad };
  const gridTemplateColumns = `48px repeat(${days.length}, minmax(0, 1fr))${
    weekendDays ? ` ${WEEKEND_COL_PX}px` : ""
  }`;
  const gridTemplate = { gridTemplateColumns };

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
        <div className="ml-auto flex items-center rounded-md border p-0.5">
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

      {/* ── Calendar frame ──────────────────────────────────── */}
      <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-lg border bg-card">
        {/* Day headers */}
        <div className="border-b" style={headerPad}>
          <div className="grid" style={gridTemplate}>
            <div />
            {days.map((day, index) => {
              const isToday = isSameDay(day, new Date());
              const isCollapsibleWeekendDay =
                narrowWeek && weekendExpanded && index >= 5;
              return (
                <div
                  className="relative border-l first-of-type:border-l-0"
                  key={format(day, "yyyy-MM-dd")}
                >
                  <button
                    className="group flex w-full flex-col items-center gap-0 py-1.5"
                    onClick={() => {
                      if (span > 1) {
                        setSpan(1);
                        setFocusIndex(
                          (workweek ? 0 : startIndex) + index
                        );
                      }
                    }}
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
                  {isCollapsibleWeekendDay && index === days.length - 1 ? (
                    <button
                      aria-label={t("calendar.collapseWeekend")}
                      className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => toggleWeekend(false)}
                      title={t("calendar.collapseWeekend")}
                      type="button"
                    >
                      <ChevronsRight className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {weekendDays ? (
              <button
                aria-label={t("calendar.expandWeekend")}
                className="flex flex-col items-center justify-center gap-0.5 border-l bg-muted/30 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => toggleWeekend(true)}
                title={t("calendar.expandWeekend")}
                type="button"
              >
                <ChevronsLeft className="h-3 w-3" />
                <span className="text-[9px] uppercase leading-none tracking-wide">
                  {new Intl.DateTimeFormat(i18n.language, {
                    weekday: "narrow",
                  }).format(weekendDays[0])}
                  ·
                  {new Intl.DateTimeFormat(i18n.language, {
                    weekday: "narrow",
                  }).format(weekendDays[1])}
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
            <div className="grid" style={gridTemplate}>
              <div className="px-1 py-1 text-right text-[9px] text-muted-foreground uppercase leading-tight tracking-wide">
                {t("calendar.unscheduled")}
              </div>
              {days.map((day, index) => (
                <div
                  className="flex min-w-0 flex-wrap gap-1 border-l px-1 py-1 first-of-type:border-l-0"
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
              {weekendDays ? <div className="border-l" /> : null}
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
              onCreateRange={handleCreateRange}
              onExpandWeekend={
                weekendDays ? () => toggleWeekend(true) : undefined
              }
              onMoveEntry={handleMoveEntry}
              onOpenEntry={handleOpenEntry}
              onResizeEntry={handleResizeEntry}
              savingEntryIds={savingIds}
              trackingRows={trackingRows}
              weekendHours={weekendHours}
            />
          )}
        </div>

        {/* Sums footer (same totals as the table view) */}
        <div style={headerPad}>
          <CalendarSums
            days={days}
            gridTemplateColumns={gridTemplateColumns}
            weekendHours={weekendDays ? weekendHours : null}
            weekEntries={renderedEntries}
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
