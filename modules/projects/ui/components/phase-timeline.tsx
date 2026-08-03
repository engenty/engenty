import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Input, Slider } from "@engenty/ui-core";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getWeek,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, ScanEye } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectPhase } from "../api.js";

export interface PhaseTimelineProps {
  onPhaseCreate?: (title: string) => Promise<string | null>; // Returns new phase ID
  onPhaseTitleUpdate?: (phaseId: string, title: string) => Promise<void>;
  onPhaseUpdate?: (
    phaseId: string,
    startDate: string | null,
    endDate: string | null
  ) => Promise<void>;
  phases: ProjectPhase[];
  projectDueDate?: string | null; // Due date for vertical alert line
  projectStartDate?: string | null;
  readOnly?: boolean; // Simplified view for public/portal
}

type DensityMode = "day" | "week" | "month";

const DENSITY_MODES: DensityMode[] = ["day", "week", "month"];
/** `size-1` on a stop tick - inset the row by its radius so the outer ticks
 *  sit flush inside the track's rounded ends instead of hanging off them. */
const TICK_SIZE = "0.25rem";

/** Left offset of stop `index` on the density scale, shared by ticks + labels. */
function densityStopOffset(index: number) {
  const fraction = index / (DENSITY_MODES.length - 1);
  return `calc(${TICK_SIZE} / 2 + ${fraction} * (100% - ${TICK_SIZE}))`;
}

const ROW_HEIGHT = 36;
const PHASE_COL_WIDTH = 200;

// Maximum range limits (in units based on density)
const MAX_RANGE = {
  day: 365, // 1 year of days
  week: 104, // 2 years of weeks
  month: 36, // 3 years of months
};

export function PhaseTimeline({
  phases,
  onPhaseUpdate,
  onPhaseCreate,
  onPhaseTitleUpdate,
  readOnly = false,
  projectStartDate,
  projectDueDate,
}: PhaseTimelineProps) {
  const { t } = useTranslation("projects");
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [density, setDensity] = useState<DensityMode>("week");
  const [rangeOffset, setRangeOffset] = useState({ before: 0, after: 0 }); // Extra units loaded
  const [dragging, setDragging] = useState<{
    phaseId: string;
    type: "move" | "resize-start" | "resize-end" | "create";
    initialX: number;
    initialStartDate: Date | null;
    initialEndDate: Date | null;
  } | null>(null);
  const [previewDates, setPreviewDates] = useState<{
    phaseId: string;
    startDate: Date | null;
    endDate: Date | null;
  } | null>(null);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isAddingPhase, setIsAddingPhase] = useState(false);
  const [newPhaseTitle, setNewPhaseTitle] = useState("");
  const newPhaseInputRef = useRef<HTMLInputElement>(null);

  // Auto-fit to view on mount for readOnly mode - show all phases
  useEffect(() => {
    if (readOnly) {
      // Find the date range from phases or project dates
      const phasesWithDates = phases.filter((p) => p.start_date || p.end_date);

      let earliest: Date | null = projectStartDate
        ? parseISO(projectStartDate)
        : null;
      let latest: Date | null = projectDueDate
        ? parseISO(projectDueDate)
        : null;

      phasesWithDates.forEach((phase) => {
        const start = phase.start_date ? parseISO(phase.start_date) : null;
        const end = phase.end_date ? parseISO(phase.end_date) : null;

        if (start && (!earliest || start < earliest)) {
          earliest = start;
        }
        if (end && (!latest || end > latest)) {
          latest = end;
        }
        if (start && (!latest || start > latest)) {
          latest = start;
        }
        if (end && (!earliest || end < earliest)) {
          earliest = end;
        }
      });

      if (earliest && latest) {
        const spanDays = differenceInDays(latest, earliest) + 1;

        // Choose density that shows all phases comfortably
        let newDensity: DensityMode;
        if (spanDays <= 21) {
          newDensity = "day";
        } else if (spanDays <= 120) {
          newDensity = "week";
        } else {
          newDensity = "month";
        }

        // Set current date to the start so all phases are visible
        queueMicrotask(() => {
          setDensity(newDensity);
          setCurrentDate(earliest!);
        });
      }
    }
  }, [readOnly, phases, projectStartDate, projectDueDate]);

  // Calculate cell width based on density
  const getCellWidth = () => {
    switch (density) {
      case "day":
        return 40;
      case "week":
        return 120;
      case "month":
        return 150;
    }
  };

  const CELL_WIDTH = getCellWidth();

  // Calculate base visible range based on density
  const getBaseRange = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    switch (density) {
      case "day": {
        const start = subWeeks(weekStart, Math.floor(rangeOffset.before / 7));
        const end = addDays(
          addWeeks(weekStart, 4 + Math.floor(rangeOffset.after / 7)),
          -1
        );
        return { start, end };
      }
      case "week": {
        const start = subWeeks(weekStart, rangeOffset.before);
        const end = addWeeks(weekStart, 8 + rangeOffset.after);
        return { start, end: addDays(end, -1) };
      }
      case "month": {
        const monthStart = startOfMonth(currentDate);
        const start = subMonths(monthStart, rangeOffset.before);
        const end = endOfMonth(addMonths(monthStart, 5 + rangeOffset.after));
        return { start, end };
      }
    }
  };

  const { start: visibleStart, end: visibleEnd } = getBaseRange();

  // Get columns based on density
  const getColumns = () => {
    switch (density) {
      case "day":
        return eachDayOfInterval({ start: visibleStart, end: visibleEnd });
      case "week":
        return eachWeekOfInterval(
          { start: visibleStart, end: visibleEnd },
          { weekStartsOn: 1 }
        );
      case "month":
        return eachMonthOfInterval({ start: visibleStart, end: visibleEnd });
    }
  };

  const columns = getColumns();

  // Show all phases in timeline (not just ones with dates)
  const allPhases = phases;

  // Handle scroll to load more dates
  const handleScroll = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
    const scrollRight = scrollWidth - scrollLeft - clientWidth;

    // Load more when within 200px of edge
    const threshold = 200;

    if (scrollLeft < threshold) {
      // Near left edge - load earlier dates
      setRangeOffset((prev) => {
        const maxBefore = MAX_RANGE[density] / 2;
        if (prev.before >= maxBefore) {
          return prev;
        }
        const increment = density === "day" ? 14 : density === "week" ? 4 : 2;
        const newBefore = Math.min(prev.before + increment, maxBefore);

        // Calculate scroll adjustment to maintain position
        const addedWidth = increment * CELL_WIDTH;
        requestAnimationFrame(() => {
          if (scrollEl) {
            scrollEl.scrollLeft += addedWidth;
          }
        });

        return { ...prev, before: newBefore };
      });
    }

    if (scrollRight < threshold) {
      // Near right edge - load later dates
      setRangeOffset((prev) => {
        const maxAfter = MAX_RANGE[density] / 2;
        if (prev.after >= maxAfter) {
          return prev;
        }
        const increment = density === "day" ? 14 : density === "week" ? 4 : 2;
        return { ...prev, after: Math.min(prev.after + increment, maxAfter) };
      });
    }
  }, [density, CELL_WIDTH]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }

    scrollEl.addEventListener("scroll", handleScroll);
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const navigate = (direction: "prev" | "next") => {
    switch (density) {
      case "day":
        setCurrentDate((prev) =>
          direction === "prev" ? subWeeks(prev, 1) : addWeeks(prev, 1)
        );
        break;
      case "week":
        setCurrentDate((prev) =>
          direction === "prev" ? subWeeks(prev, 2) : addWeeks(prev, 2)
        );
        break;
      case "month":
        setCurrentDate((prev) =>
          direction === "prev" ? subMonths(prev, 1) : addMonths(prev, 1)
        );
        break;
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setRangeOffset({ before: 0, after: 0 });
  };

  // Zoom out to show the whole project timeframe (project dates + all phases).
  // The visible window is clamped between 1 month (min) and 1 year (max).
  const fitAllToView = () => {
    const MIN_SPAN_DAYS = 30;
    const MAX_SPAN_DAYS = 365;

    // Whole timeframe = explicit project dates expanded to include all phases.
    const { start: rawStart, end: rawEnd } = getEffectiveProjectDates();
    const earliest = rawStart ?? rawEnd;
    const latest = rawEnd ?? rawStart;
    if (!(earliest && latest)) {
      return;
    }

    // Clamp the span around its center: at least 1 month, at most 1 year.
    const actualSpan = Math.max(1, differenceInDays(latest, earliest) + 1);
    const clampedSpan = Math.min(
      MAX_SPAN_DAYS,
      Math.max(MIN_SPAN_DAYS, actualSpan)
    );
    const center = addDays(earliest, Math.floor(actualSpan / 2));
    const windowStart = addDays(center, -Math.floor(clampedSpan / 2));
    const windowEnd = addDays(windowStart, clampedSpan - 1);

    // Pick a density that reads well at this zoom level.
    const newDensity: DensityMode = clampedSpan <= 90 ? "week" : "month";

    // Expand the visible range so the whole window fits, plus a small pad.
    let after: number;
    if (newDensity === "week") {
      const weeksNeeded = Math.ceil(clampedSpan / 7);
      // Base week range shows 8 weeks.
      after = Math.max(0, weeksNeeded - 8 + 1);
    } else {
      const monthsNeeded =
        (windowEnd.getFullYear() - windowStart.getFullYear()) * 12 +
        (windowEnd.getMonth() - windowStart.getMonth()) +
        1;
      // Base month range shows 6 months.
      after = Math.max(0, monthsNeeded - 6 + 1);
    }

    setDensity(newDensity);
    setCurrentDate(windowStart);
    setRangeOffset({ before: 0, after });
  };

  // Calculate effective project dates (explicit or derived from phases)
  const getEffectiveProjectDates = useCallback(() => {
    let earliest: Date | null = projectStartDate
      ? parseISO(projectStartDate)
      : null;
    let latest: Date | null = null;

    // Expand to include all phase dates
    phases.forEach((phase) => {
      const start = phase.start_date ? parseISO(phase.start_date) : null;
      const end = phase.end_date ? parseISO(phase.end_date) : null;

      if (start && (!earliest || start < earliest)) {
        earliest = start;
      }
      if (end && (!latest || end > latest)) {
        latest = end;
      }
      if (start && (!latest || start > latest)) {
        latest = start;
      }
      if (end && (!earliest || end < earliest)) {
        earliest = end;
      }
    });

    return { start: earliest, end: latest };
  }, [phases, projectStartDate]);

  const effectiveProjectDates = getEffectiveProjectDates();

  // Calculate project span position
  const getProjectSpanPosition = useCallback((): {
    left: number;
    width: number;
  } | null => {
    const { start: projectStart, end: projectEnd } = effectiveProjectDates;

    if (!(projectStart && projectEnd)) {
      return null;
    }

    let left: number;
    let width: number;

    switch (density) {
      case "day": {
        const daysFromStart = differenceInDays(projectStart, visibleStart);
        const duration = differenceInDays(projectEnd, projectStart) + 1;
        left = daysFromStart * CELL_WIDTH;
        width = Math.max(duration * CELL_WIDTH, CELL_WIDTH);
        break;
      }
      case "week": {
        const daysFromStart = differenceInDays(projectStart, visibleStart);
        const duration = differenceInDays(projectEnd, projectStart) + 1;
        left = (daysFromStart / 7) * CELL_WIDTH;
        width = Math.max((duration / 7) * CELL_WIDTH, CELL_WIDTH / 7);
        break;
      }
      case "month": {
        const monthsFromStart =
          (projectStart.getFullYear() - visibleStart.getFullYear()) * 12 +
          (projectStart.getMonth() - visibleStart.getMonth()) +
          projectStart.getDate() / 30;
        const monthsDuration =
          (projectEnd.getFullYear() - projectStart.getFullYear()) * 12 +
          (projectEnd.getMonth() - projectStart.getMonth()) +
          (projectEnd.getDate() - projectStart.getDate() + 1) / 30;
        left = monthsFromStart * CELL_WIDTH;
        width = Math.max(monthsDuration * CELL_WIDTH, CELL_WIDTH / 4);
        break;
      }
    }

    return { left, width };
  }, [effectiveProjectDates, density, CELL_WIDTH, visibleStart]);

  const getPhasePosition = useCallback(
    (phase: ProjectPhase): { left: number; width: number } | null => {
      const dates = previewDates?.phaseId === phase.id ? previewDates : null;
      const startDate =
        dates?.startDate ??
        (phase.start_date ? parseISO(phase.start_date) : null);
      const endDate =
        dates?.endDate ?? (phase.end_date ? parseISO(phase.end_date) : null);

      if (!(startDate || endDate)) {
        return null;
      }

      const effectiveStart = startDate || endDate!;
      const effectiveEnd = endDate || startDate!;

      let left: number;
      let width: number;

      switch (density) {
        case "day": {
          const daysFromStart = differenceInDays(effectiveStart, visibleStart);
          const duration = differenceInDays(effectiveEnd, effectiveStart) + 1;
          left = daysFromStart * CELL_WIDTH;
          width = Math.max(duration * CELL_WIDTH, CELL_WIDTH);
          break;
        }
        case "week": {
          const daysFromStart = differenceInDays(effectiveStart, visibleStart);
          const duration = differenceInDays(effectiveEnd, effectiveStart) + 1;
          left = (daysFromStart / 7) * CELL_WIDTH;
          width = Math.max((duration / 7) * CELL_WIDTH, CELL_WIDTH / 7);
          break;
        }
        case "month": {
          const monthsFromStart =
            (effectiveStart.getFullYear() - visibleStart.getFullYear()) * 12 +
            (effectiveStart.getMonth() - visibleStart.getMonth()) +
            effectiveStart.getDate() / 30;
          const monthsDuration =
            (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12 +
            (effectiveEnd.getMonth() - effectiveStart.getMonth()) +
            (effectiveEnd.getDate() - effectiveStart.getDate() + 1) / 30;
          left = monthsFromStart * CELL_WIDTH;
          width = Math.max(monthsDuration * CELL_WIDTH, CELL_WIDTH / 4);
          break;
        }
      }

      return { left, width };
    },
    [visibleStart, previewDates, density, CELL_WIDTH]
  );

  const handleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      phase: ProjectPhase,
      type: "move" | "resize-start" | "resize-end"
    ) => {
      if (!onPhaseUpdate) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      setDragging({
        phaseId: phase.id,
        type,
        initialX: e.clientX,
        initialStartDate: phase.start_date ? parseISO(phase.start_date) : null,
        initialEndDate: phase.end_date ? parseISO(phase.end_date) : null,
      });
    },
    [onPhaseUpdate]
  );

  // Handle drag-to-create bar in empty row
  const handleRowMouseDown = useCallback(
    (e: React.MouseEvent, phase: ProjectPhase) => {
      if (!onPhaseUpdate || phase.start_date || phase.end_date) {
        return;
      }

      const scrollEl = scrollRef.current;
      if (!scrollEl) {
        return;
      }

      const rect = scrollEl.getBoundingClientRect();
      const scrollLeft = scrollEl.scrollLeft;
      const clickX = e.clientX - rect.left + scrollLeft;

      // Calculate date from click position
      let clickedDate: Date;
      switch (density) {
        case "day":
          clickedDate = addDays(visibleStart, Math.floor(clickX / CELL_WIDTH));
          break;
        case "week":
          clickedDate = addDays(
            visibleStart,
            Math.floor((clickX / CELL_WIDTH) * 7)
          );
          break;
        case "month":
          clickedDate = addMonths(
            visibleStart,
            Math.floor(clickX / CELL_WIDTH)
          );
          break;
      }

      setDragging({
        phaseId: phase.id,
        type: "create",
        initialX: e.clientX,
        initialStartDate: clickedDate,
        initialEndDate: clickedDate,
      });

      setPreviewDates({
        phaseId: phase.id,
        startDate: clickedDate,
        endDate: clickedDate,
      });
    },
    [onPhaseUpdate, density, CELL_WIDTH, visibleStart]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) {
        return;
      }

      const deltaX = e.clientX - dragging.initialX;

      // Calculate days delta based on density
      let daysDelta: number;
      switch (density) {
        case "day":
          daysDelta = Math.round(deltaX / CELL_WIDTH);
          break;
        case "week":
          daysDelta = Math.round((deltaX / CELL_WIDTH) * 7);
          break;
        case "month":
          daysDelta = Math.round((deltaX / CELL_WIDTH) * 30);
          break;
      }

      let newStartDate = dragging.initialStartDate;
      let newEndDate = dragging.initialEndDate;

      if (dragging.type === "create") {
        // For create, extend endDate from initial position
        if (newStartDate) {
          newEndDate = addDays(newStartDate, Math.max(0, daysDelta));
          if (daysDelta < 0) {
            newEndDate = newStartDate;
            newStartDate = addDays(dragging.initialStartDate!, daysDelta);
          }
        }
      } else if (dragging.type === "move") {
        if (newStartDate) {
          newStartDate = addDays(newStartDate, daysDelta);
        }
        if (newEndDate) {
          newEndDate = addDays(newEndDate, daysDelta);
        }
      } else if (dragging.type === "resize-start" && newStartDate) {
        newStartDate = addDays(newStartDate, daysDelta);
        if (newEndDate && newStartDate > newEndDate) {
          newStartDate = newEndDate;
        }
      } else if (dragging.type === "resize-end" && newEndDate) {
        newEndDate = addDays(newEndDate, daysDelta);
        if (newStartDate && newEndDate < newStartDate) {
          newEndDate = newStartDate;
        }
      }

      setPreviewDates({
        phaseId: dragging.phaseId,
        startDate: newStartDate,
        endDate: newEndDate,
      });
    },
    [dragging, density, CELL_WIDTH]
  );

  const handleMouseUp = useCallback(async () => {
    if (!(dragging && previewDates && onPhaseUpdate)) {
      setDragging(null);
      setPreviewDates(null);
      return;
    }

    await onPhaseUpdate(
      dragging.phaseId,
      previewDates.startDate
        ? format(previewDates.startDate, "yyyy-MM-dd")
        : null,
      previewDates.endDate ? format(previewDates.endDate, "yyyy-MM-dd") : null
    );

    setDragging(null);
    setPreviewDates(null);
  }, [dragging, previewDates, onPhaseUpdate]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Format column header based on density
  const formatColumnHeader = (date: Date) => {
    switch (density) {
      case "day":
        return {
          primary: format(date, "EEE"),
          secondary: format(date, "d"),
        };
      case "week": {
        const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
        const weekNum = getWeek(date, { weekStartsOn: 1 });
        return {
          primary: `${format(date, "d. MMM")} — ${format(weekEnd, "d")}`,
          secondary: `${t("detail.timeline.week")} ${weekNum}`,
        };
      }
      case "month":
        return {
          primary: format(date, "MMMM"),
          secondary: format(date, "yyyy"),
        };
    }
  };

  // Check if a column contains today
  const columnContainsToday = (date: Date) => {
    const today = new Date();
    switch (density) {
      case "day":
        return isToday(date);
      case "week": {
        const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
        return today >= date && today <= weekEnd;
      }
      case "month":
        return isSameMonth(today, date);
    }
  };

  // Lazily loaded extra columns are counted in the *current* density's unit, so
  // carrying them into another density would blow the window up (e.g. 26 extra
  // weeks read as 26 extra months). Always start the new density from its base
  // range and let scrolling grow it again.
  const applyDensity = (mode: DensityMode) => {
    if (mode === density) {
      return;
    }
    setDensity(mode);
    setRangeOffset({ before: 0, after: 0 });
  };

  const handleDensityChange = (value: number | readonly number[]) => {
    const index = Array.isArray(value) ? value[0] : (value as number);
    const mode = DENSITY_MODES[index];
    if (mode) {
      applyDensity(mode);
    }
  };

  // Inline title editing
  const handleTitleDoubleClick = (phase: ProjectPhase) => {
    if (!onPhaseTitleUpdate) {
      return;
    }
    setEditingPhaseId(phase.id);
    setEditingTitle(phase.title);
  };

  const handleTitleBlur = async () => {
    if (editingPhaseId && editingTitle.trim() && onPhaseTitleUpdate) {
      await onPhaseTitleUpdate(editingPhaseId, editingTitle.trim());
    }
    setEditingPhaseId(null);
    setEditingTitle("");
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleBlur();
    } else if (e.key === "Escape") {
      setEditingPhaseId(null);
      setEditingTitle("");
    }
  };

  // Add new phase
  const handleAddPhase = () => {
    setIsAddingPhase(true);
    setNewPhaseTitle("");
    setTimeout(() => newPhaseInputRef.current?.focus(), 0);
  };

  const handleNewPhaseBlur = async () => {
    if (newPhaseTitle.trim() && onPhaseCreate) {
      await onPhaseCreate(newPhaseTitle.trim());
    }
    setIsAddingPhase(false);
    setNewPhaseTitle("");
  };

  const handleNewPhaseKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNewPhaseBlur();
    } else if (e.key === "Escape") {
      setIsAddingPhase(false);
      setNewPhaseTitle("");
    }
  };

  // Calculate today line position
  const getTodayLinePosition = () => {
    const today = new Date();

    switch (density) {
      case "day": {
        const todayOffset = differenceInDays(today, visibleStart);
        if (todayOffset >= 0 && todayOffset < columns.length) {
          return todayOffset * CELL_WIDTH + CELL_WIDTH / 2;
        }
        break;
      }
      case "week": {
        const daysFromStart = differenceInDays(today, visibleStart);
        if (daysFromStart >= 0 && daysFromStart < columns.length * 7) {
          return (daysFromStart / 7) * CELL_WIDTH;
        }
        break;
      }
      case "month": {
        const monthsFromStart =
          (today.getFullYear() - visibleStart.getFullYear()) * 12 +
          (today.getMonth() - visibleStart.getMonth()) +
          today.getDate() / 30;
        if (monthsFromStart >= 0 && monthsFromStart < columns.length) {
          return monthsFromStart * CELL_WIDTH;
        }
        break;
      }
    }
    return null;
  };

  // Calculate due date line position
  const getDueDateLinePosition = () => {
    if (!projectDueDate) {
      return null;
    }

    const dueDate = parseISO(projectDueDate);

    switch (density) {
      case "day": {
        const dueDateOffset = differenceInDays(dueDate, visibleStart);
        if (dueDateOffset >= 0 && dueDateOffset < columns.length) {
          return dueDateOffset * CELL_WIDTH + CELL_WIDTH / 2;
        }
        break;
      }
      case "week": {
        const daysFromStart = differenceInDays(dueDate, visibleStart);
        if (daysFromStart >= 0 && daysFromStart < columns.length * 7) {
          return (daysFromStart / 7) * CELL_WIDTH;
        }
        break;
      }
      case "month": {
        const monthsFromStart =
          (dueDate.getFullYear() - visibleStart.getFullYear()) * 12 +
          (dueDate.getMonth() - visibleStart.getMonth()) +
          dueDate.getDate() / 30;
        if (monthsFromStart >= 0 && monthsFromStart < columns.length) {
          return monthsFromStart * CELL_WIDTH;
        }
        break;
      }
    }
    return null;
  };

  const todayLinePos = getTodayLinePosition();
  const dueDateLinePos = getDueDateLinePosition();

  return (
    <div className="mb-6 overflow-hidden rounded-lg border bg-muted/30">
      {/* Navigation Header - simplified for readOnly */}
      <div className="flex items-center justify-between border-b bg-background/50 px-4 py-2">
        <div className="flex items-center gap-2">
          {readOnly ? (
            // Simplified header for public view - just show date range
            <span className="font-medium text-sm">
              {projectStartDate && projectDueDate ? (
                <>
                  {format(parseISO(projectStartDate), "MMM d")} –{" "}
                  {format(parseISO(projectDueDate), "MMM d, yyyy")}
                </>
              ) : (
                <>
                  {format(visibleStart, "MMM d")} –{" "}
                  {format(visibleEnd, "MMM d, yyyy")}
                </>
              )}
            </span>
          ) : (
            <>
              {/* Navigation arrows and date range */}
              <Button
                className="size-7"
                onClick={() => navigate("prev")}
                size="icon"
                variant="ghost"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[160px] font-medium text-sm">
                {format(visibleStart, "MMM d")} –{" "}
                {format(visibleEnd, "MMM d, yyyy")}
              </span>
              <Button
                className="size-7"
                onClick={() => navigate("next")}
                size="icon"
                variant="ghost"
              >
                <ChevronRight className="size-4" />
              </Button>

              {/* Today button */}
              <Button
                className="h-7 px-2 text-xs"
                onClick={goToToday}
                size="sm"
                variant="outline"
              >
                {t("detail.timeline.today")}
              </Button>

              {/* Fit all button */}
              <Button
                className="size-7"
                onClick={fitAllToView}
                size="icon"
                title={t("detail.timeline.fitAll")}
                variant="ghost"
              >
                <ScanEye className="size-3.5" />
              </Button>
            </>
          )}
        </div>

        {/* Density / zoom scale - hide in readOnly mode.
            A scale, not a quantity: the filled range is suppressed (it would
            read as "50% of something" at Woche). Ticks, labels and the thumb
            all share `densityStopOffset`, and `thumbAlignment="center"` lets
            the thumb travel the full track so the outer stops land on its
            ends instead of half a thumb inside them. */}
        {!readOnly && (
          <div
            className="flex w-24 flex-col gap-2.5"
            title={t("detail.timeline.zoom")}
          >
            {/* h-2.5 + explicit 10px/10px type: the thumb overhangs the track
                by 5px, so the label row has to stay that clear of it. */}
            <div className="relative h-2.5">
              {DENSITY_MODES.map((mode, index) => (
                <button
                  aria-label={t(`detail.timeline.density.${mode}`)}
                  aria-pressed={density === mode}
                  className={cn(
                    "absolute top-0 -translate-x-1/2 text-[10px] leading-[10px] transition-colors",
                    density === mode
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  key={mode}
                  onClick={() => applyDensity(mode)}
                  style={{ left: densityStopOffset(index) }}
                  type="button"
                >
                  {t(`detail.timeline.densityShort.${mode}`)}
                </button>
              ))}
            </div>
            <div className="relative">
              {/* z-1: above the (opaque) track, below the thumb. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[1]"
              >
                {DENSITY_MODES.map((mode, index) => (
                  <span
                    className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/50"
                    key={mode}
                    style={{ left: densityStopOffset(index) }}
                  />
                ))}
              </div>
              <Slider
                className="[&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:z-[2] [&_[data-slot=slider-track]]:bg-muted-foreground/15"
                max={DENSITY_MODES.length - 1}
                onValueChange={handleDensityChange}
                step={1}
                thumbAlignment="center"
                value={[DENSITY_MODES.indexOf(density)]}
              />
            </div>
          </div>
        )}
      </div>

      <div
        className="relative flex overflow-x-auto overscroll-x-none"
        style={{ overscrollBehaviorX: "none" }}
      >
        {/* Phase Column - sticky on desktop, not on mobile; z-40 so it stays above today/due vertical lines */}
        <div
          className="left-0 z-40 shrink-0 border-r bg-background md:sticky"
          style={{ width: PHASE_COL_WIDTH }}
        >
          {/* Header - ensure button stacks above timeline lines */}
          <div className="relative z-10 flex h-[52px] items-center justify-between border-b px-2">
            <span className="font-medium text-muted-foreground text-xs uppercase">
              {t("detail.timeline.phases")}
            </span>
            {!readOnly && onPhaseCreate && (
              <Button
                className="relative z-20 size-6 rounded-md"
                onClick={handleAddPhase}
                size="icon"
                variant="default"
              >
                <Plus className="size-3.5" />
              </Button>
            )}
          </div>
          {/* Project span row - thin, no label */}
          {effectiveProjectDates.start && effectiveProjectDates.end && (
            <div className="border-b" style={{ height: 20 }} />
          )}
          {/* Phase names */}
          {allPhases.map((phase) => (
            <div
              className="flex items-center border-b px-3 last:border-b-0"
              key={phase.id}
              style={{ height: ROW_HEIGHT }}
            >
              {!readOnly && editingPhaseId === phase.id ? (
                <Input
                  autoFocus
                  className="h-6 px-1 text-sm"
                  onBlur={handleTitleBlur}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  value={editingTitle}
                />
              ) : (
                <span
                  className={cn(
                    "truncate font-medium text-sm",
                    !readOnly &&
                      onPhaseTitleUpdate &&
                      "-mx-1 cursor-text rounded px-1 hover:bg-muted/50"
                  )}
                  onDoubleClick={
                    readOnly ? undefined : () => handleTitleDoubleClick(phase)
                  }
                >
                  {phase.title}
                </span>
              )}
            </div>
          ))}
          {/* New phase input row */}
          {isAddingPhase && (
            <div
              className="flex items-center border-b px-3"
              style={{ height: ROW_HEIGHT }}
            >
              <Input
                className="h-6 px-1 text-sm"
                onBlur={handleNewPhaseBlur}
                onChange={(e) => setNewPhaseTitle(e.target.value)}
                onKeyDown={handleNewPhaseKeyDown}
                placeholder={t("detail.timeline.newPhase")}
                ref={newPhaseInputRef}
                value={newPhaseTitle}
              />
            </div>
          )}
        </div>

        {/* Scrollable Timeline */}
        <div
          className="flex-1 overflow-x-auto overscroll-x-none"
          ref={scrollRef}
          style={{ overscrollBehaviorX: "none" }}
        >
          <div
            className="relative select-none"
            ref={containerRef}
            style={{ width: columns.length * CELL_WIDTH }}
          >
            {/* Timeline Header */}
            <div className="flex h-[52px] border-b">
              {columns.map((date) => {
                const header = formatColumnHeader(date);
                const isTodayColumn = columnContainsToday(date);
                const isWeekend =
                  density === "day" &&
                  (date.getDay() === 0 || date.getDay() === 6);

                return (
                  <div
                    className={cn(
                      "flex shrink-0 flex-col items-center justify-center border-r py-2 text-center",
                      isWeekend && "bg-muted/50",
                      isTodayColumn && "bg-primary/10"
                    )}
                    key={date.toISOString()}
                    style={{ width: CELL_WIDTH }}
                  >
                    <span
                      className={cn(
                        "font-medium text-sm",
                        isTodayColumn && "text-primary"
                      )}
                    >
                      {header.primary}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {header.secondary}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Project Span Row - thin row at top */}
            {(() => {
              const projectSpanPos = getProjectSpanPosition();
              if (
                !(
                  projectSpanPos &&
                  effectiveProjectDates.start &&
                  effectiveProjectDates.end
                )
              ) {
                return null;
              }

              return (
                <div className="relative flex border-b" style={{ height: 20 }}>
                  {/* Column grid lines */}
                  <div className="pointer-events-none absolute inset-0 flex">
                    {columns.map((date) => {
                      const isTodayColumn = columnContainsToday(date);
                      const isWeekend =
                        density === "day" &&
                        (date.getDay() === 0 || date.getDay() === 6);

                      return (
                        <div
                          className={cn(
                            "h-full shrink-0 border-r",
                            isWeekend && "bg-muted/30",
                            isTodayColumn && "bg-primary/5"
                          )}
                          key={date.toISOString()}
                          style={{ width: CELL_WIDTH }}
                        />
                      );
                    })}
                  </div>

                  {/* Project span clamp - bracket style with bottom connection */}
                  {/* Start vertical bar */}
                  <div
                    className="absolute w-px bg-primary/60"
                    style={{
                      left: projectSpanPos.left,
                      top: 4,
                      bottom: 2,
                    }}
                  />
                  {/* Bottom horizontal line */}
                  <div
                    className="absolute h-px bg-primary/60"
                    style={{
                      left: projectSpanPos.left,
                      bottom: 2,
                      width: projectSpanPos.width,
                    }}
                  />
                  {/* End vertical bar */}
                  <div
                    className="absolute w-px bg-primary/60"
                    style={{
                      left: projectSpanPos.left + projectSpanPos.width - 1,
                      top: 4,
                      bottom: 2,
                    }}
                  />
                  {/* Date label - positioned above the line */}
                  <div
                    className="absolute whitespace-nowrap text-muted-foreground text-xxs"
                    style={{
                      left: projectSpanPos.left + 6,
                      top: 2,
                    }}
                  >
                    {format(effectiveProjectDates.start, "d. MMM yyyy")} —{" "}
                    {format(effectiveProjectDates.end, "d. MMM yyyy")}
                  </div>
                </div>
              );
            })()}

            {/* Phase Rows */}
            {allPhases.map((phase) => {
              const position = getPhasePosition(phase);
              const hasNoDates = !(phase.start_date || phase.end_date);

              // Get effective dates for display (including preview)
              const dates =
                previewDates?.phaseId === phase.id ? previewDates : null;
              const displayStartDate =
                dates?.startDate ??
                (phase.start_date ? parseISO(phase.start_date) : null);
              const displayEndDate =
                dates?.endDate ??
                (phase.end_date ? parseISO(phase.end_date) : null);

              const canEdit = !readOnly && onPhaseUpdate;

              return (
                <div
                  className={cn(
                    "relative flex border-b last:border-b-0",
                    hasNoDates && canEdit && "cursor-crosshair"
                  )}
                  key={phase.id}
                  onMouseDown={
                    hasNoDates && canEdit
                      ? (e) => handleRowMouseDown(e, phase)
                      : undefined
                  }
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Column grid lines */}
                  <div className="pointer-events-none absolute inset-0 flex">
                    {columns.map((date) => {
                      const isTodayColumn = columnContainsToday(date);
                      const isWeekend =
                        density === "day" &&
                        (date.getDay() === 0 || date.getDay() === 6);

                      return (
                        <div
                          className={cn(
                            "h-full shrink-0 border-r",
                            isWeekend && "bg-muted/30",
                            isTodayColumn && "bg-primary/5"
                          )}
                          key={date.toISOString()}
                          style={{ width: CELL_WIDTH }}
                        />
                      );
                    })}
                  </div>

                  {/* Phase bar */}
                  {position && (
                    <div
                      className={cn(
                        "absolute top-1 h-[calc(100%-8px)] rounded-md bg-primary/80 text-primary-foreground",
                        "flex items-center justify-between px-1 font-medium text-xs",
                        "border border-primary/30 shadow-sm",
                        canEdit && "cursor-move",
                        dragging?.phaseId === phase.id &&
                          "opacity-80 ring-2 ring-primary"
                      )}
                      onMouseDown={
                        canEdit
                          ? (e) => handleMouseDown(e, phase, "move")
                          : undefined
                      }
                      style={{
                        left: position.left,
                        width: position.width,
                      }}
                    >
                      {/* Left resize handle */}
                      {canEdit && (
                        <div
                          className="absolute top-0 bottom-0 left-0 flex w-2 cursor-ew-resize items-center justify-center rounded-l-md transition-colors hover:bg-primary-foreground/20"
                          onMouseDown={(e) =>
                            handleMouseDown(e, phase, "resize-start")
                          }
                        >
                          <div className="h-3 w-0.5 rounded-full bg-primary-foreground/50" />
                        </div>
                      )}

                      {/* Phase label */}
                      <span className="pointer-events-none truncate px-2">
                        {displayStartDate && displayEndDate && (
                          <>
                            {format(displayStartDate, "d. MMM")} —{" "}
                            {format(displayEndDate, "d. MMM")}
                          </>
                        )}
                      </span>

                      {/* Right resize handle */}
                      {canEdit && (
                        <div
                          className="absolute top-0 right-0 bottom-0 flex w-2 cursor-ew-resize items-center justify-center rounded-r-md transition-colors hover:bg-primary-foreground/20"
                          onMouseDown={(e) =>
                            handleMouseDown(e, phase, "resize-end")
                          }
                        >
                          <div className="h-3 w-0.5 rounded-full bg-primary-foreground/50" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Empty row for adding phase */}
            {!readOnly && isAddingPhase && (
              <div
                className="relative flex border-b last:border-b-0"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="pointer-events-none absolute inset-0 flex">
                  {columns.map((date) => (
                    <div
                      className="h-full shrink-0 border-r"
                      key={date.toISOString()}
                      style={{ width: CELL_WIDTH }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Today line - z-0 so it stays behind the sticky phase column (+ button) */}
            {todayLinePos !== null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-0 w-0.5 bg-primary"
                style={{ left: todayLinePos }}
              />
            )}

            {/* Due date line */}
            {dueDateLinePos !== null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-0 w-0.5 bg-destructive"
                style={{ left: dueDateLinePos }}
              >
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-medium text-destructive text-xxs">
                  {t("detail.timeline.dueDate")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
