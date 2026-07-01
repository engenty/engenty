import { isSameDay, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { Fragment } from "react";
import { entryMatchesRow } from "../hooks/use-time-entry-operations.js";
import { TimeEntryCell } from "./time-entry-cell.js";
import { useTimeTrackingContext } from "./time-tracking-context.js";
import type { TimeEntry, TrackingRow as TrackingRowType } from "./types.js";
import { getTotalHoursForRow } from "./utils.js";

interface TrackingRowProps {
  indent?: number;
  row: TrackingRowType;
  timeEntries: TimeEntry[];
  weekDays: Date[];
}

function RowLabel({
  className,
  discipline,
  onDelete,
}: {
  className?: string;
  discipline?: string;
  onDelete?: () => void;
}) {
  return (
    <div
      className={[
        "group/row flex w-full items-center justify-between pr-2",
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground text-sm leading-tight">
        <span className="opacity-50">↳</span>{" "}
        {discipline ? discipline : "Allgemein"}
      </div>
      {onDelete && (
        <button
          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus:opacity-100 group-hover/row:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete row"
          type="button"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function MobileLabelRow({
  className,
  discipline,
  onDelete,
}: {
  className?: string;
  discipline?: string;
  onDelete?: () => void;
}) {
  return (
    <tr className="border-b bg-card md:hidden">
      <td className="px-2 py-2" colSpan={9}>
        <RowLabel
          className={className}
          discipline={discipline}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

export function TrackingRow({
  row,
  weekDays,
  timeEntries,
  indent = 4,
}: TrackingRowProps) {
  const ctx = useTimeTrackingContext();

  const rowEntries = timeEntries.filter((entry) => entryMatchesRow(entry, row));
  const uniqueDisciplines = Array.from(
    new Set(rowEntries.map((e) => e.discipline || ""))
  ).filter(Boolean);
  const hasMultipleDisciplines = uniqueDisciplines.length > 1;

  const isManual = !row.id.startsWith("task-");
  const handleDelete = isManual ? () => ctx.onDeleteRow(row.id) : undefined;

  const renderCells = (displayRow: TrackingRowType) =>
    weekDays.map((day) => (
      <TimeEntryCell
        day={day}
        entry={ctx.getEntryForRowAndDate(displayRow, day)}
        key={day.toISOString()}
        onDelete={() => {
          const e = ctx.getEntryForRowAndDate(displayRow, day);
          if (e) {
            ctx.onDeleteEntry(e.id);
          }
        }}
        onSave={(hours, notes, discipline) => {
          // Look up at call time — prevents the stale-closure double-save bug.
          const currentEntry = ctx.getEntryForRowAndDate(displayRow, day);
          ctx.onSaveEntry(
            displayRow,
            day,
            currentEntry,
            hours,
            notes,
            discipline
          );
        }}
        row={displayRow}
      />
    ));

  if (hasMultipleDisciplines) {
    const totalHours = getTotalHoursForRow(row, timeEntries);
    return (
      <>
        <tr className="hidden border-b bg-muted/5 md:table-row">
          <td
            className="hidden px-0.5 py-1 md:table-cell"
            style={{ paddingLeft: `${indent * 0.25}rem` }}
          >
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs leading-tight lg:text-sm">
              <span className="opacity-50">↳</span> Mehrere
            </div>
          </td>
          {weekDays.map((day) => {
            const dayTotal = rowEntries
              .filter((e) => isSameDay(parseISO(e.date), day))
              .reduce((sum, e) => sum + Number(e.hours), 0);
            return (
              <td
                className="min-w-24 px-0.5 py-1 text-center text-muted-foreground text-xs md:min-w-0 lg:text-sm"
                key={day.toISOString()}
              >
                {dayTotal > 0 ? dayTotal.toFixed(1) : ""}
              </td>
            );
          })}
          <td className="hidden px-0.5 py-1 text-center font-medium text-muted-foreground text-xs md:table-cell lg:text-sm">
            {totalHours.toFixed(1)}h
          </td>
        </tr>
        {uniqueDisciplines.map((discipline) => {
          const disciplineRow = { ...row, discipline };
          const hours = getTotalHoursForRow(disciplineRow, timeEntries);
          return (
            <Fragment key={`${row.id}-${discipline}`}>
              <MobileLabelRow
                className="text-muted-foreground"
                discipline={discipline}
                onDelete={handleDelete}
              />
              <tr className="border-b hover:bg-muted/50">
                <td
                  className="hidden px-0.5 py-1 md:table-cell"
                  style={{ paddingLeft: `${(indent + 4) * 0.25}rem` }}
                >
                  <div className="text-muted-foreground text-xxs leading-tight lg:text-xs">
                    {discipline}
                  </div>
                </td>
                {renderCells(disciplineRow)}
                <td className="hidden px-0.5 py-1 text-center font-medium text-xs md:table-cell lg:text-sm">
                  {hours.toFixed(1)}h
                </td>
              </tr>
            </Fragment>
          );
        })}
      </>
    );
  }

  const displayRow = uniqueDisciplines[0]
    ? { ...row, discipline: uniqueDisciplines[0] }
    : row;
  const totalHours = getTotalHoursForRow(displayRow, timeEntries);
  return (
    <>
      <MobileLabelRow
        discipline={uniqueDisciplines[0]}
        onDelete={handleDelete}
      />
      <tr className="border-b hover:bg-muted/50">
        <td
          className="hidden px-0.5 py-1 md:table-cell"
          style={{ paddingLeft: `${indent * 0.25}rem` }}
        >
          <RowLabel discipline={uniqueDisciplines[0]} onDelete={handleDelete} />
        </td>
        {renderCells(displayRow)}
        <td className="hidden px-0.5 py-1 text-center font-medium text-xs md:table-cell lg:text-sm">
          {totalHours.toFixed(1)}h
        </td>
      </tr>
    </>
  );
}
