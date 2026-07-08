import { useTranslation } from "@engenty/i18n/ui";
import { format } from "date-fns";
import type { TimeEntry } from "../types.js";
import { getGrandTotal, getTotalHoursForDay } from "../utils.js";
import { formatHours } from "./calendar-utils.js";

interface CalendarSumsProps {
  days: Date[];
  /** Shared column template so the footer aligns with the grid/header. */
  gridTemplateColumns: string;
  /** Present in the narrow week view — mirrors the collapsible weekend. */
  weekend: { collapsed: boolean; hours: number } | null;
  /** All entries of the loaded week — the grand total matches the table view. */
  weekEntries: TimeEntry[];
}

/** Sticky footer mirroring the table view's totals row. */
export function CalendarSums({
  days,
  gridTemplateColumns,
  weekend,
  weekEntries,
}: CalendarSumsProps) {
  const { t } = useTranslation("time-tracking");
  const weekendCollapsed = Boolean(weekend?.collapsed);
  return (
    <div className="relative border-t-2 bg-muted/30">
      <div className="grid font-bold" style={{ gridTemplateColumns }}>
        <div className="px-1 py-2 text-center text-muted-foreground text-xs">
          Σ
        </div>
        {days.map((day, index) => {
          const total = getTotalHoursForDay(day, weekEntries);
          const collapsed = weekendCollapsed && index >= 5;
          return (
            <div
              className={[
                "min-w-0 overflow-hidden px-0.5 py-2 text-center text-xs tabular-nums transition-opacity duration-300 lg:text-sm",
                collapsed ? "opacity-0" : "opacity-100",
              ].join(" ")}
              key={format(day, "yyyy-MM-dd")}
            >
              {total > 0 ? formatHours(total) : "–"}
            </div>
          );
        })}
        {weekend === null ? null : (
          <div
            className={[
              "min-w-0 overflow-hidden border-l py-2 text-center text-[10px] text-muted-foreground tabular-nums",
              "transition-opacity duration-300",
              weekendCollapsed ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {weekend.hours > 0 ? formatHours(weekend.hours) : "–"}
          </div>
        )}
      </div>
      <div
        className={`-translate-y-1/2 absolute top-1/2 flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs shadow-xs transition-all duration-300 ${
          weekendCollapsed ? "right-11" : "right-2"
        }`}
      >
        <span className="text-muted-foreground">{t("total")}</span>
        <span className="font-bold tabular-nums">
          {formatHours(getGrandTotal(weekEntries))}
        </span>
      </div>
    </div>
  );
}
