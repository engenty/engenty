import { isSameDay, parseISO } from "date-fns";
import type { TimeEntry, TrackingRow } from "./types.js";

export function getTotalHoursForRow(
  row: TrackingRow,
  timeEntries: TimeEntry[]
) {
  return timeEntries
    .filter((entry) => {
      const matchesDiscipline = row.discipline
        ? entry.discipline === row.discipline
        : true;
      if (row.type === "task") {
        return entry.task_id === row.task_id && matchesDiscipline;
      }
      if (row.type === "phase") {
        return (
          entry.phase_id === row.phase_id && !entry.task_id && matchesDiscipline
        );
      }
      return (
        entry.project_id === row.project_id &&
        !entry.phase_id &&
        !entry.task_id &&
        matchesDiscipline
      );
    })
    .reduce((sum, entry) => sum + Number(entry.hours), 0);
}

export function getTotalHoursForDay(date: Date, timeEntries: TimeEntry[]) {
  return timeEntries
    .filter((entry) => isSameDay(parseISO(entry.date), date))
    .reduce((sum, entry) => sum + Number(entry.hours), 0);
}

export function getGrandTotal(timeEntries: TimeEntry[]) {
  return timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
}

export function getRowLabel(row: TrackingRow) {
  if (row.task_title) {
    return `↳ ${row.task_title}`;
  }
  if (row.phase_title) {
    return `→ ${row.phase_title}`;
  }
  return "General";
}
