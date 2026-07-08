import { format, isSameDay, parseISO } from "date-fns";
import { ChevronsLeft, StickyNote } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimeEntry, TrackingRow } from "../types.js";
import {
  blockColorStyle,
  clampMinutes,
  entriesForDay,
  entryColorKey,
  entryDurationMin,
  entryLabel,
  entryStartMin,
  formatDuration,
  formatHours,
  GRID_PX,
  HOUR_PX,
  layoutDayBlocks,
  MIN_DURATION,
  minutesToTime,
  projectColor,
  snapFloor,
  snapRound,
  WEEKEND_COL_PX,
} from "./calendar-utils.js";

const DRAG_THRESHOLD_PX = 4;
const DEFAULT_CREATE_MIN = 60;
const MIN_BLOCK_PX = 14;

type DragState =
  | {
      anchorMin: number;
      dayIndex: number;
      endMin: number;
      kind: "create";
      moved: boolean;
      startMin: number;
    }
  | {
      dayIndex: number;
      durationMin: number;
      entry: TimeEntry;
      grabOffsetMin: number;
      kind: "move";
      moved: boolean;
      startMin: number;
    }
  | {
      dayIndex: number;
      endMin: number;
      entry: TimeEntry;
      kind: "resize-end" | "resize-start";
      moved: boolean;
      startMin: number;
    };

interface CalendarGridProps {
  days: Date[];
  entries: TimeEntry[];
  onCreateRange: (day: Date, startMin: number, durationMin: number) => void;
  /** When set, a collapsed weekend strip is rendered after the day columns. */
  onExpandWeekend?: () => void;
  onMoveEntry: (entry: TimeEntry, day: Date, startMin: number) => void;
  onOpenEntry: (entry: TimeEntry) => void;
  onResizeEntry: (
    entry: TimeEntry,
    startMin: number,
    durationMin: number
  ) => void;
  savingEntryIds: Set<string>;
  trackingRows: TrackingRow[];
  weekendHours?: number;
}

interface PointerPosition {
  dayIndex: number;
  minutes: number;
}

function useNowMinutes() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { minutes: now.getHours() * 60 + now.getMinutes(), now };
}

export function CalendarGrid({
  days,
  entries,
  onCreateRange,
  onExpandWeekend,
  onMoveEntry,
  onOpenEntry,
  onResizeEntry,
  savingEntryIds,
  trackingRows,
  weekendHours = 0,
}: CalendarGridProps) {
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const { minutes: nowMinutes, now } = useNowMinutes();

  const pointToPosition = useCallback(
    (clientX: number, clientY: number): PointerPosition | null => {
      const rects = columnRefs.current
        .slice(0, days.length)
        .map((el) => el?.getBoundingClientRect() ?? null);
      const first = rects.find(Boolean);
      if (!first) {
        return null;
      }
      let dayIndex = 0;
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (!rect) {
          continue;
        }
        if (clientX >= rect.left) {
          dayIndex = i;
        }
      }
      const rect = rects[dayIndex] ?? first;
      const minutes = clampMinutes(((clientY - rect.top) / HOUR_PX) * 60);
      return { dayIndex, minutes };
    },
    [days.length]
  );

  // Global listeners while dragging so the gesture survives leaving the grid.
  useEffect(() => {
    if (!drag) {
      return;
    }

    const handleMove = (event: PointerEvent) => {
      const current = dragRef.current;
      const origin = originRef.current;
      if (!(current && origin)) {
        return;
      }
      const moved =
        current.moved ||
        Math.abs(event.clientX - origin.x) > DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - origin.y) > DRAG_THRESHOLD_PX;
      const pos = pointToPosition(event.clientX, event.clientY);
      if (!pos) {
        return;
      }

      if (current.kind === "create") {
        const a = current.anchorMin;
        const b = snapRound(pos.minutes);
        const lo = Math.min(a, b);
        setDrag({
          ...current,
          endMin: Math.max(a + MIN_DURATION, b, lo + MIN_DURATION),
          moved,
          startMin: lo,
        });
      } else if (current.kind === "move") {
        const startMin = clampMinutes(
          snapRound(pos.minutes - current.grabOffsetMin)
        );
        setDrag({
          ...current,
          dayIndex: pos.dayIndex,
          moved,
          startMin: Math.min(startMin, 24 * 60 - current.durationMin),
        });
      } else if (current.kind === "resize-end") {
        setDrag({
          ...current,
          endMin: Math.max(
            current.startMin + MIN_DURATION,
            snapRound(pos.minutes)
          ),
          moved,
        });
      } else {
        setDrag({
          ...current,
          moved,
          startMin: Math.min(
            current.endMin - MIN_DURATION,
            snapFloor(pos.minutes)
          ),
        });
      }
    };

    const handleUp = () => {
      const current = dragRef.current;
      setDrag(null);
      originRef.current = null;
      if (!current) {
        return;
      }
      const day = days[current.dayIndex];
      if (!day) {
        return;
      }

      if (current.kind === "create") {
        if (current.moved) {
          onCreateRange(
            day,
            current.startMin,
            Math.max(MIN_DURATION, current.endMin - current.startMin)
          );
        } else {
          onCreateRange(day, snapFloor(current.anchorMin), DEFAULT_CREATE_MIN);
        }
        return;
      }

      if (current.kind === "move") {
        if (!current.moved) {
          onOpenEntry(current.entry);
          return;
        }
        const originalStart = entryStartMin(current.entry);
        const sameDay = isSameDay(parseISO(current.entry.date), day);
        if (!sameDay || originalStart !== current.startMin) {
          onMoveEntry(current.entry, day, current.startMin);
        }
        return;
      }

      // resize
      if (!current.moved) {
        onOpenEntry(current.entry);
        return;
      }
      const durationMin = current.endMin - current.startMin;
      const originalStart = entryStartMin(current.entry) ?? 0;
      if (
        durationMin !== entryDurationMin(current.entry) ||
        originalStart !== current.startMin
      ) {
        onResizeEntry(current.entry, current.startMin, durationMin);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [
    drag,
    days,
    onCreateRange,
    onMoveEntry,
    onOpenEntry,
    onResizeEntry,
    pointToPosition,
  ]);

  const startCreate = (event: React.PointerEvent, dayIndex: number) => {
    if (event.button !== 0 || drag) {
      return;
    }
    const pos = pointToPosition(event.clientX, event.clientY);
    if (!pos) {
      return;
    }
    originRef.current = { x: event.clientX, y: event.clientY };
    const anchor = snapFloor(pos.minutes);
    setDrag({
      anchorMin: anchor,
      dayIndex,
      endMin: anchor + MIN_DURATION,
      kind: "create",
      moved: false,
      startMin: anchor,
    });
  };

  const startMove = (
    event: React.PointerEvent,
    entry: TimeEntry,
    dayIndex: number
  ) => {
    if (event.button !== 0 || drag || savingEntryIds.has(entry.id)) {
      return;
    }
    event.stopPropagation();
    const pos = pointToPosition(event.clientX, event.clientY);
    const startMin = entryStartMin(entry);
    if (!pos || startMin == null) {
      return;
    }
    originRef.current = { x: event.clientX, y: event.clientY };
    setDrag({
      dayIndex,
      durationMin: entryDurationMin(entry),
      entry,
      grabOffsetMin: pos.minutes - startMin,
      kind: "move",
      moved: false,
      startMin,
    });
  };

  const startResize = (
    event: React.PointerEvent,
    entry: TimeEntry,
    dayIndex: number,
    edge: "start" | "end"
  ) => {
    if (event.button !== 0 || drag || savingEntryIds.has(entry.id)) {
      return;
    }
    event.stopPropagation();
    const startMin = entryStartMin(entry);
    if (startMin == null) {
      return;
    }
    originRef.current = { x: event.clientX, y: event.clientY };
    setDrag({
      dayIndex,
      endMin: Math.min(24 * 60, startMin + entryDurationMin(entry)),
      entry,
      kind: edge === "end" ? "resize-end" : "resize-start",
      moved: false,
      startMin,
    });
  };

  const hourMarks = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const renderBlock = (
    entry: TimeEntry,
    dayIndex: number,
    startMin: number,
    endMin: number,
    lane: number,
    lanes: number,
    ghost: boolean
  ) => {
    const label = entryLabel(entry, trackingRows);
    const color = projectColor(entryColorKey(entry, trackingRows));
    const durationMin = endMin - startMin;
    const compact = durationMin < 45;
    const saving = savingEntryIds.has(entry.id);
    const widthPct = 100 / lanes;
    return (
      <div
        className={[
          "group absolute overflow-hidden rounded-md border text-left shadow-xs transition-shadow",
          ghost
            ? "pointer-events-none z-20 opacity-90 shadow-md ring-1 ring-ring"
            : "z-10 cursor-grab hover:shadow-sm active:cursor-grabbing",
          saving ? "opacity-50" : "",
        ].join(" ")}
        key={ghost ? `ghost-${entry.id}` : entry.id}
        onPointerDown={
          ghost ? undefined : (event) => startMove(event, entry, dayIndex)
        }
        style={{
          ...blockColorStyle(color),
          height: Math.max(MIN_BLOCK_PX, (durationMin / 60) * HOUR_PX) - 2,
          left: `calc(${lane * widthPct}% + 2px)`,
          top: (startMin / 60) * HOUR_PX + 1,
          touchAction: "none",
          width: `calc(${widthPct}% - 4px)`,
        }}
      >
        <div
          className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l"
          style={{ backgroundColor: color }}
        />
        <div className="flex h-full flex-col gap-0 px-2 py-1 pl-3">
          {compact ? (
            <div className="flex items-baseline gap-1.5 truncate">
              <span className="truncate font-medium text-foreground text-xs">
                {label.title}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {minutesToTime(startMin)} · {formatDuration(durationMin)}
              </span>
            </div>
          ) : (
            <>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {minutesToTime(startMin)} – {minutesToTime(endMin)}
                <span className="rounded-full bg-background/60 px-1 font-medium">
                  {formatDuration(durationMin)}
                </span>
                {entry.notes ? <StickyNote className="h-2.5 w-2.5" /> : null}
              </span>
              <span className="truncate font-medium text-foreground text-xs">
                {label.title}
              </span>
              {label.subtitle && durationMin >= 60 ? (
                <span className="truncate text-[10px] text-muted-foreground">
                  {label.subtitle}
                </span>
              ) : null}
            </>
          )}
        </div>
        {!ghost && (
          <>
            <div
              className="absolute top-0 right-0 left-0 h-1.5 cursor-ns-resize"
              onPointerDown={(event) =>
                startResize(event, entry, dayIndex, "start")
              }
            />
            <div
              className="absolute right-0 bottom-0 left-0 h-1.5 cursor-ns-resize"
              onPointerDown={(event) =>
                startResize(event, entry, dayIndex, "end")
              }
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className="grid select-none"
      style={{
        gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))${
          onExpandWeekend ? ` ${WEEKEND_COL_PX}px` : ""
        }`,
        height: GRID_PX,
      }}
    >
      {/* Hour gutter */}
      <div className="relative border-r">
        {hourMarks.map((hour) => (
          <span
            className="-translate-y-1/2 absolute right-2 text-[10px] text-muted-foreground tabular-nums"
            key={hour}
            style={{ top: hour * HOUR_PX }}
          >
            {hour === 0 ? "" : `${String(hour).padStart(2, "0")}:00`}
          </span>
        ))}
      </div>

      {days.map((day, dayIndex) => {
        const dayEntries = entriesForDay(entries, day);
        const blocks = layoutDayBlocks(
          drag?.kind === "move" || drag?.kind === "resize-end" || drag?.kind === "resize-start"
            ? dayEntries.filter((entry) => entry.id !== drag.entry.id)
            : dayEntries
        );
        const isToday = isSameDay(day, now);
        return (
          <div
            className={[
              "relative border-r last:border-r-0",
              isToday ? "bg-primary/[0.025]" : "",
            ].join(" ")}
            key={format(day, "yyyy-MM-dd")}
            onPointerDown={(event) => startCreate(event, dayIndex)}
            ref={(el) => {
              columnRefs.current[dayIndex] = el;
            }}
            style={{ touchAction: "pan-y" }}
          >
            {/* Hour + half-hour lines */}
            {hourMarks.map((hour) => (
              <div key={hour}>
                <div
                  className="absolute right-0 left-0 border-border/70 border-t"
                  style={{ top: hour * HOUR_PX }}
                />
                <div
                  className="absolute right-0 left-0 border-border/30 border-t border-dashed"
                  style={{ top: hour * HOUR_PX + HOUR_PX / 2 }}
                />
              </div>
            ))}

            {/* Now indicator */}
            {isToday && (
              <div
                className="pointer-events-none absolute right-0 left-0 z-20 flex items-center"
                style={{ top: (nowMinutes / 60) * HOUR_PX }}
              >
                <span className="-ml-1 h-2 w-2 rounded-full bg-primary" />
                <div className="h-px flex-1 bg-primary" />
              </div>
            )}

            {/* Entry blocks */}
            {blocks.map((block) =>
              renderBlock(
                block.entry,
                dayIndex,
                block.startMin,
                block.endMin,
                block.lane,
                block.lanes,
                false
              )
            )}

            {/* Drag previews */}
            {drag?.kind === "create" && drag.dayIndex === dayIndex && (
              <div
                className="pointer-events-none absolute right-0.5 left-0.5 z-20 rounded-md border border-primary border-dashed bg-primary/10"
                style={{
                  height: ((drag.endMin - drag.startMin) / 60) * HOUR_PX,
                  top: (drag.startMin / 60) * HOUR_PX,
                }}
              >
                <span className="px-2 py-1 text-[10px] text-primary">
                  {minutesToTime(drag.startMin)} – {minutesToTime(drag.endMin)}
                </span>
              </div>
            )}
            {drag?.kind === "move" &&
              drag.dayIndex === dayIndex &&
              drag.moved &&
              renderBlock(
                drag.entry,
                dayIndex,
                drag.startMin,
                drag.startMin + drag.durationMin,
                0,
                1,
                true
              )}
            {(drag?.kind === "resize-end" || drag?.kind === "resize-start") &&
              drag.dayIndex === dayIndex &&
              renderBlock(
                drag.entry,
                dayIndex,
                drag.startMin,
                drag.endMin,
                0,
                1,
                true
              )}
          </div>
        );
      })}

      {/* Collapsed weekend strip */}
      {onExpandWeekend ? (
        <button
          className="group flex flex-col justify-start border-l bg-muted/30 transition-colors hover:bg-accent/60"
          onClick={onExpandWeekend}
          type="button"
        >
          <div className="sticky top-2 flex flex-col items-center gap-1.5 py-2 text-muted-foreground group-hover:text-foreground">
            <ChevronsLeft className="h-3 w-3" />
            {weekendHours > 0 ? (
              <span className="rounded-full bg-background px-1 py-0.5 font-medium text-[9px] tabular-nums shadow-xs [writing-mode:vertical-rl]">
                {formatHours(weekendHours)}
              </span>
            ) : null}
          </div>
        </button>
      ) : null}
    </div>
  );
}
