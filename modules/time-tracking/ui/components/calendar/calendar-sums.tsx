import { useTranslation } from "@engenty/i18n/ui";
import { format } from "date-fns";
import type { TimeEntry } from "../types.js";
import { getGrandTotal, getTotalHoursForDay } from "../utils.js";
import { formatHours } from "./calendar-utils.js";

interface CalendarSumsProps {
  days: Date[];
  /** All entries of the loaded week — the grand total matches the table view. */
  weekEntries: TimeEntry[];
}

/** Sticky footer mirroring the table view's totals row. */
export function CalendarSums({ days, weekEntries }: CalendarSumsProps) {
  const { t } = useTranslation("time-tracking");
  return (
    <div className="relative border-t-2 bg-muted/30">
      <div
        className="grid font-bold"
        style={{
          gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="px-1 py-2 text-center text-muted-foreground text-xs">
          Σ
        </div>
        {days.map((day) => {
          const total = getTotalHoursForDay(day, weekEntries);
          return (
            <div
              className="px-0.5 py-2 text-center text-xs tabular-nums lg:text-sm"
              key={format(day, "yyyy-MM-dd")}
            >
              {total > 0 ? formatHours(total) : "–"}
            </div>
          );
        })}
      </div>
      <div className="-translate-y-1/2 absolute top-1/2 right-2 flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs shadow-xs">
        <span className="text-muted-foreground">{t("total")}</span>
        <span className="font-bold tabular-nums">
          {formatHours(getGrandTotal(weekEntries))}
        </span>
      </div>
    </div>
  );
}
