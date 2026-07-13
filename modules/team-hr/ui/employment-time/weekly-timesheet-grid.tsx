import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@engenty/ui-core";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  EmployeeWorkingHours,
  TimeRecord,
} from "../employment-time-queries.js";

// Helper to calculate ISO Week Number
export function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
}

export function getWeekYear(d: Date): number {
  const date = new Date(d);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  return date.getFullYear();
}

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

const WEEKDAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAYS_SHORT_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const WEEKDAYS_FULL = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

interface WeeklyTimesheetGridProps {
  currentDate: Date;
  holidays: { date: string; name: string }[];
  isLoading: boolean;
  onChangeDate: (date: Date) => void;
  onUpsertRecord: (
    record: TimeRecord
  ) => Promise<{ record: TimeRecord; warnings: string[] }>;
  profileId: string;
  targetHoursByDay: Record<string, number> | null;
  timeRecords: TimeRecord[];
  workingHours: EmployeeWorkingHours[];
}

export function WeeklyTimesheetGrid({
  profileId,
  currentDate,
  onChangeDate,
  targetHoursByDay,
  workingHours,
  timeRecords,
  holidays,
  onUpsertRecord,
  isLoading,
}: WeeklyTimesheetGridProps) {
  const { t, i18n } = useTranslation("team");
  const isDe = i18n.language === "de";

  const days = useMemo(() => {
    const monday = getMonday(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const holidaysMap = useMemo(
    () => new Map(holidays.map((h) => [h.date, h.name])),
    [holidays]
  );
  const recordsMap = useMemo(
    () => new Map(timeRecords.map((r) => [r.date, r])),
    [timeRecords]
  );

  // Local grid state
  const [gridData, setGridData] = useState<
    Record<
      string,
      {
        id?: string;
        clock_in: string;
        clock_out: string;
        break_minutes: string;
        absence_type: string;
        notes: string;
        target_hours: number;
        actual_hours: number;
        warnings: string[];
      }
    >
  >({});

  // Sync prop changes to local state
  useEffect(() => {
    const newGridData: typeof gridData = {};
    for (const day of days) {
      const dateStr = day.toISOString().split("T")[0];
      const record = recordsMap.get(dateStr);
      const isHoliday = holidaysMap.has(dateStr);

      const dayName = WEEKDAYS_FULL[day.getDay()];
      const activeVersion = getActiveWorkingHoursVersion(dateStr, workingHours);
      let targetHours = 0;
      if (activeVersion?.schedule[dayName]) {
        const dayPlan = activeVersion.schedule[dayName];
        if (dayPlan.enabled) {
          targetHours = calculateDailyHours(
            dayPlan.start,
            dayPlan.end,
            dayPlan.break_minutes
          );
        }
      } else if (targetHoursByDay) {
        targetHours = targetHoursByDay[dayName] ?? 0;
      }

      // Calculate warnings locally
      const warnings: string[] = [];
      const actual = record ? Number(record.actual_hours) : 0;
      if (record) {
        if (actual > 12) {
          warnings.push(
            isDe
              ? "Max. tägliche Arbeitszeit von 12 Stunden überschritten."
              : "Maximum daily working time of 12 hours exceeded."
          );
        }
        const clockInMins = parseTimeToMinutes(record.clock_in);
        const clockOutMins = parseTimeToMinutes(record.clock_out);
        if (clockInMins !== null && clockOutMins !== null) {
          const totalShift = Math.max(0, clockOutMins - clockInMins);
          if (totalShift > 360 && record.break_minutes < 30) {
            warnings.push(
              isDe
                ? "Nach 6 Std. Arbeit ist eine Pause von mind. 30 Min. erforderlich."
                : "A break of at least 30 minutes is required after 6 hours of work."
            );
          }
        }
      }

      newGridData[dateStr] = {
        id: record?.id,
        clock_in: record?.clock_in ? record.clock_in.slice(0, 5) : "",
        clock_out: record?.clock_out ? record.clock_out.slice(0, 5) : "",
        break_minutes: record ? String(record.break_minutes) : "0",
        absence_type: record?.absence_type || (isHoliday ? "holiday" : ""),
        notes: record?.notes || "",
        target_hours: targetHours,
        actual_hours: actual,
        warnings,
      };
    }
    setGridData(newGridData);
  }, [days, recordsMap, targetHoursByDay, workingHours, holidaysMap, isDe]);

  // Derive target & actual sums
  const totals = useMemo(() => {
    let target = 0;
    let actual = 0;
    for (const key of Object.keys(gridData)) {
      target += gridData[key].target_hours || 0;
      actual += gridData[key].actual_hours || 0;
    }
    return {
      target,
      actual,
    };
  }, [gridData]);

  // Format hours to H:MM format (e.g. 35 -> "35:00", 7.5 -> "7:30")
  const formatHoursToHHMM = (hours: number): string => {
    const mins = Math.round(hours * 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  // Helper for computing individual actual hours
  const calculateRowActualHours = (
    clockIn: string,
    clockOut: string,
    breakMinsStr: string,
    targetHours: number,
    absenceType: string
  ): number => {
    if (
      absenceType &&
      absenceType !== "holiday" &&
      absenceType !== "home_office" &&
      absenceType !== "travel"
    ) {
      // Sickness, vacation etc. credits target hours
      return targetHours;
    }
    const cleanIn = clockIn.trim();
    const cleanOut = clockOut.trim();
    if (!(cleanIn && cleanOut)) {
      return 0;
    }

    const inVal = parseTimeToMinutes(cleanIn);
    const outVal = parseTimeToMinutes(cleanOut);
    const breakMins = Number.parseInt(breakMinsStr, 10) || 0;

    if (inVal !== null && outVal !== null) {
      let diff = outVal - inVal;
      if (diff < 0) {
        diff += 24 * 60;
      }
      return Math.round((Math.max(0, diff - breakMins) / 60) * 100) / 100;
    }
    return 0;
  };

  // Handle cell blur & recalculation
  const handleCellBlur = (
    dateStr: string,
    field: "clock_in" | "clock_out" | "break_minutes" | "absence_type" | "notes"
  ) => {
    setGridData((prev) => {
      const current = prev[dateStr];
      if (!current) {
        return prev;
      }

      let clockIn = current.clock_in;
      let clockOut = current.clock_out;
      if (field === "clock_in" && clockIn) {
        clockIn = formatTimeInput(clockIn);
      }
      if (field === "clock_out" && clockOut) {
        clockOut = formatTimeInput(clockOut);
      }

      const actualHours = calculateRowActualHours(
        clockIn,
        clockOut,
        current.break_minutes,
        current.target_hours,
        current.absence_type
      );

      return {
        ...prev,
        [dateStr]: {
          ...current,
          clock_in: clockIn,
          clock_out: clockOut,
          actual_hours: actualHours,
        },
      };
    });
  };

  // Save changes to database
  const handleSave = async () => {
    let savedCount = 0;
    let hasError = false;

    for (const day of days) {
      const dateStr = day.toISOString().split("T")[0];
      const current = gridData[dateStr];
      const dbRecord = recordsMap.get(dateStr);

      if (!current) {
        continue;
      }

      const hasDbRecord = !!dbRecord;
      const dbClockIn = dbRecord?.clock_in ? dbRecord.clock_in.slice(0, 5) : "";
      const dbClockOut = dbRecord?.clock_out
        ? dbRecord.clock_out.slice(0, 5)
        : "";
      const dbBreak = dbRecord ? String(dbRecord.break_minutes) : "0";
      const dbAbsence = dbRecord?.absence_type || "";
      const dbNotes = dbRecord?.notes || "";

      // Check if row has changed compared to DB
      const hasChanged =
        !hasDbRecord ||
        dbClockIn !== current.clock_in ||
        dbClockOut !== current.clock_out ||
        dbBreak !== current.break_minutes ||
        dbAbsence !== current.absence_type ||
        dbNotes !== current.notes;

      if (!hasChanged) {
        continue;
      }

      // Skip saving empty rows that don't exist in DB
      if (
        !(hasDbRecord || current.clock_in || current.clock_out) &&
        current.break_minutes === "0" &&
        !current.absence_type &&
        !current.notes
      ) {
        continue;
      }

      try {
        const payload: TimeRecord = {
          id: current.id,
          profile_id: profileId,
          date: dateStr,
          clock_in: current.clock_in || null,
          clock_out: current.clock_out || null,
          break_minutes: Number.parseInt(current.break_minutes, 10) || 0,
          actual_hours: current.actual_hours,
          target_hours: current.target_hours,
          absence_type: current.absence_type || null,
          notes: current.notes || null,
        };

        const res = await onUpsertRecord(payload);
        if (res.warnings.length > 0) {
          toast.warning(`${dateStr}: ${res.warnings.join(" ")}`);
        }
        savedCount++;
      } catch {
        hasError = true;
      }
    }

    if (hasError) {
      toast.error(
        isDe
          ? "Fehler beim Speichern einiger Einträge."
          : "Error saving some timesheet entries."
      );
    } else if (savedCount > 0) {
      toast.success(
        isDe
          ? `${savedCount} Tage erfolgreich gespeichert.`
          : `${savedCount} days saved successfully.`
      );
    } else {
      toast.info(
        isDe ? "Keine Änderungen zu speichern." : "No changes to save."
      );
    }
  };

  // Submit Week
  const handleSubmitWeek = () => {
    toast.success(
      isDe ? "Woche erfolgreich eingereicht!" : "Week submitted successfully!"
    );
  };

  // Autofill defaults for Mon-Fri workdays
  const handleApplyDefaults = () => {
    setGridData((prev) => {
      const next = { ...prev };
      let filled = 0;

      for (const day of days) {
        const dateStr = day.toISOString().split("T")[0];
        const current = next[dateStr];
        if (!current) {
          continue;
        }

        const dayName = WEEKDAYS_FULL[day.getDay()];
        const activeVersion = getActiveWorkingHoursVersion(
          dateStr,
          workingHours
        );

        let defaultStart = "";
        let defaultEnd = "";
        let defaultBreak = "0";
        let defaultActual = 0;
        let shouldApply = false;

        if (activeVersion?.schedule[dayName]) {
          const dayPlan = activeVersion.schedule[dayName];
          if (dayPlan.enabled && dayPlan.start && dayPlan.end) {
            defaultStart = dayPlan.start;
            defaultEnd = dayPlan.end;
            defaultBreak = String(dayPlan.break_minutes);
            defaultActual = calculateDailyHours(
              dayPlan.start,
              dayPlan.end,
              dayPlan.break_minutes
            );
            shouldApply = !(current.clock_in || current.clock_out);
          }
        } else {
          // Fallback logic
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          if (
            !isWeekend &&
            current.target_hours > 0 &&
            !current.clock_in &&
            !current.clock_out
          ) {
            defaultStart = "09:00";
            const breakMins = current.target_hours > 6 ? 30 : 0;
            const totalMinutes = current.target_hours * 60 + breakMins;
            const endMinutes = 9 * 60 + totalMinutes;
            const outHours = Math.floor(endMinutes / 60) % 24;
            const outMins = endMinutes % 60;
            defaultEnd = `${String(outHours).padStart(2, "0")}:${String(outMins).padStart(2, "0")}`;
            defaultBreak = String(breakMins);
            defaultActual = current.target_hours;
            shouldApply = true;
          }
        }

        if (shouldApply) {
          next[dateStr] = {
            ...current,
            clock_in: defaultStart,
            clock_out: defaultEnd,
            break_minutes: defaultBreak,
            absence_type: "",
            actual_hours: defaultActual,
          };
          filled++;
        }
      }

      if (filled > 0) {
        toast.info(
          isDe
            ? "Standardwerte für Woche geladen (bitte Speichern klicken)."
            : "Default values loaded for week (click Save to apply)."
        );
      } else {
        toast.info(
          isDe
            ? "Keine leeren Arbeitstage zum Befüllen gefunden."
            : "No empty work days found to autofill."
        );
      }

      return next;
    });
  };

  // Keyboard navigation refs
  const gridRef = useRef<HTMLTableSectionElement>(null);
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    dateStr: string,
    fieldIndex: number
  ) => {
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (!keys.includes(e.key)) {
      return;
    }

    const rowElements = Array.from(
      gridRef.current?.querySelectorAll("tr") || []
    );
    const rowIndex = rowElements.findIndex((tr) => tr.dataset.date === dateStr);
    if (rowIndex === -1) {
      return;
    }

    let targetRowIndex = rowIndex;
    let targetColIndex = fieldIndex;

    if (e.key === "ArrowUp") {
      targetRowIndex = Math.max(0, rowIndex - 1);
    } else if (e.key === "ArrowDown") {
      targetRowIndex = Math.min(rowElements.length - 1, rowIndex + 1);
    } else if (e.key === "ArrowLeft") {
      targetColIndex = Math.max(0, fieldIndex - 1);
    } else if (e.key === "ArrowRight") {
      targetColIndex = Math.min(4, fieldIndex + 1);
    }

    e.preventDefault();
    const targetRow = rowElements[targetRowIndex];
    const inputs = Array.from(
      targetRow.querySelectorAll("input, select")
    ) as HTMLElement[];
    const targetInput = inputs[targetColIndex];
    if (targetInput) {
      targetInput.focus();
    }
  };

  const weekNum = getWeekNumber(currentDate);
  const weekYear = getWeekYear(currentDate);

  const handlePrevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    onChangeDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    onChangeDate(d);
  };

  const handleCurrentWeek = () => {
    onChangeDate(new Date());
  };

  // Format short date (e.g. 15.06.)
  const formatDateLabel = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="font-bold text-2xl text-foreground tracking-tight">
            {isDe ? "Zeiterfassung" : "Time Tracking"}
          </h2>
          <p className="mt-0.5 font-medium text-muted-foreground text-sm">
            {isDe
              ? `Woche ${weekNum} · ${weekYear}`
              : `Week ${weekNum} · ${weekYear}`}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button
            className="flex h-9 w-9 items-center justify-center rounded-lg border-border/80 p-0"
            onClick={handlePrevWeek}
            size="sm"
            variant="outline"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            className="h-9 rounded-lg border-border/80 px-4 font-semibold text-foreground/80 text-xs hover:text-foreground"
            onClick={handleCurrentWeek}
            size="sm"
            variant="outline"
          >
            {isDe ? "Aktuelle Woche" : "Current Week"}
          </Button>
          <Button
            className="flex h-9 w-9 items-center justify-center rounded-lg border-border/80 p-0"
            onClick={handleNextWeek}
            size="sm"
            variant="outline"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Status & Action Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/60 bg-muted/10 p-4 backdrop-blur-xs sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <span className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/5 px-3 py-1 font-semibold text-orange-500 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            {isDe ? "Offen" : "Open"}
          </span>
          <span className="font-medium text-muted-foreground text-sm">
            {isDe ? "Wochensumme:" : "Weekly Total:"}{" "}
            <span className="ml-1 font-mono font-semibold text-foreground">
              {formatHoursToHHMM(totals.actual)}
            </span>
            <span className="font-mono font-semibold text-muted-foreground/60">
              {" "}
              / {formatHoursToHHMM(totals.target)}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-9.5 rounded-lg border-border/80 bg-card px-4 font-semibold text-foreground/85 text-xs hover:bg-muted/30"
            onClick={handleApplyDefaults}
            size="sm"
            variant="outline"
          >
            {isDe
              ? "Defaults für ganze Woche übernehmen"
              : "Apply defaults for whole week"}
          </Button>
          <Button
            className="h-9.5 rounded-lg border-border/80 border-indigo-500/25 bg-indigo-500/10 px-4 font-semibold text-indigo-500 text-xs hover:bg-indigo-500/20"
            onClick={handleSave}
            size="sm"
            variant="outline"
          >
            {isDe ? "Speichern" : "Save"}
          </Button>
          <Button
            className="h-9.5 rounded-lg bg-blue-600 px-4 font-semibold text-white text-xs shadow-xs hover:bg-blue-700"
            onClick={handleSubmitWeek}
            size="sm"
            variant="default"
          >
            {isDe ? "Woche einreichen" : "Submit Week"}
          </Button>
        </div>
      </div>

      {/* Spreadsheet Table Grid */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card/45 shadow-xs backdrop-blur-md">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-border/80 border-b bg-muted/40 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              <th className="w-28 p-3">{isDe ? "Datum" : "Date"}</th>
              <th className="w-40 p-3">{isDe ? "Tagtyp" : "Day Type"}</th>
              <th className="w-36 p-3 text-center">
                {isDe ? "Beginn" : "Start"}
              </th>
              <th className="w-36 p-3 text-center">{isDe ? "Ende" : "End"}</th>
              <th className="w-28 p-3 text-center">
                {isDe ? "Pause (Min)" : "Break (m)"}
              </th>
              <th className="w-28 p-3 text-center">
                {isDe ? "Stunden" : "Hours"}
              </th>
              <th className="p-3">{isDe ? "Notiz" : "Notes"}</th>
            </tr>
          </thead>
          <tbody ref={gridRef}>
            {days.map((day) => {
              const dateStr = day.toISOString().split("T")[0];
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const holidayName = holidaysMap.get(dateStr);
              const isHoliday = !!holidayName;

              const current = gridData[dateStr] || {
                clock_in: "",
                clock_out: "",
                break_minutes: "0",
                absence_type: "",
                notes: "",
                target_hours: 0,
                actual_hours: 0,
                warnings: [],
              };

              const weekdayLabel = isDe
                ? WEEKDAYS_SHORT_DE[day.getDay()]
                : WEEKDAYS_SHORT[day.getDay()];
              const dateLabel = formatDateLabel(day);

              // Work time inputs are disabled for non-working absences
              const isWorkType =
                !current.absence_type ||
                current.absence_type === "home_office" ||
                current.absence_type === "travel";
              const isInputsDisabled = !isWorkType;

              return (
                <tr
                  className={`border-border/60 border-b transition-colors hover:bg-muted/30 ${
                    isHoliday
                      ? "bg-purple-500/5 hover:bg-purple-500/10"
                      : isWeekend
                        ? "bg-muted/10"
                        : ""
                  }`}
                  data-date={dateStr}
                  key={dateStr}
                >
                  {/* Date Column */}
                  <td className="p-2.5 pl-4 align-middle">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
                        {weekdayLabel}
                        {current.warnings.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-pointer text-amber-500">
                                <AlertTriangle className="h-4 w-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="whitespace-pre-line">
                              {current.warnings.join("\n")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                      <span className="mt-0.5 text-muted-foreground/80 text-xs">
                        {dateLabel}
                      </span>
                    </div>
                  </td>

                  {/* Day Type Dropdown */}
                  <td className="p-2 align-middle">
                    {isHoliday ? (
                      <span className="inline-block max-w-[140px] truncate rounded-lg bg-purple-500/10 px-2 py-1.5 font-medium text-purple-500 text-xs">
                        {holidayName}
                      </span>
                    ) : (
                      <div className="relative w-full">
                        <select
                          className="h-9 w-full appearance-none rounded-lg border border-border/80 bg-card py-0 pr-8 pl-2.5 font-medium text-xs shadow-2xs outline-none transition-colors hover:bg-muted/10 focus:border-ring focus:ring-1 focus:ring-ring"
                          onChange={(e) => {
                            const val = e.target.value;
                            setGridData((prev) => {
                              const next = { ...prev };
                              const row = next[dateStr];
                              if (row) {
                                const actualHours = calculateRowActualHours(
                                  row.clock_in,
                                  row.clock_out,
                                  row.break_minutes,
                                  row.target_hours,
                                  val
                                );
                                next[dateStr] = {
                                  ...row,
                                  absence_type: val,
                                  actual_hours: actualHours,
                                };
                              }
                              return next;
                            });
                          }}
                          value={current.absence_type}
                        >
                          <option value="">{isDe ? "Arbeit" : "Work"}</option>
                          <option value="home_office">
                            {isDe ? "Home-Office" : "Home Office"}
                          </option>
                          <option value="travel">
                            {isDe ? "Reise" : "Travel"}
                          </option>
                          <option value="vacation">
                            {isDe ? "Urlaub" : "Vacation"}
                          </option>
                          <option value="sick_leave">
                            {isDe ? "Krank" : "Sick"}
                          </option>
                          <option value="special_leave">
                            {isDe ? "Sondertag" : "Special Day"}
                          </option>
                          <option value="holiday">
                            {isDe ? "Feiertag" : "Holiday"}
                          </option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                      </div>
                    )}
                  </td>

                  {/* Clock In */}
                  <td className="p-2 text-center align-middle">
                    <div className="relative mx-auto max-w-[120px]">
                      <Input
                        className="h-9 rounded-lg border-border/80 bg-card pr-8 pl-2 text-center font-mono font-semibold text-xs"
                        disabled={isInputsDisabled}
                        onBlur={() => handleCellBlur(dateStr, "clock_in")}
                        onChange={(e) =>
                          setGridData((prev) => ({
                            ...prev,
                            [dateStr]: {
                              ...prev[dateStr],
                              clock_in: e.target.value,
                            },
                          }))
                        }
                        onKeyDown={(e) => handleKeyDown(e, dateStr, 0)}
                        placeholder="09:00"
                        value={current.clock_in}
                      />
                      <Clock className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    </div>
                  </td>

                  {/* Clock Out */}
                  <td className="p-2 text-center align-middle">
                    <div className="relative mx-auto max-w-[120px]">
                      <Input
                        className="h-9 rounded-lg border-border/80 bg-card pr-8 pl-2 text-center font-mono font-semibold text-xs"
                        disabled={isInputsDisabled}
                        onBlur={() => handleCellBlur(dateStr, "clock_out")}
                        onChange={(e) =>
                          setGridData((prev) => ({
                            ...prev,
                            [dateStr]: {
                              ...prev[dateStr],
                              clock_out: e.target.value,
                            },
                          }))
                        }
                        onKeyDown={(e) => handleKeyDown(e, dateStr, 2)}
                        placeholder="17:00"
                        value={current.clock_out}
                      />
                      <Clock className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    </div>
                  </td>

                  {/* Break Minutes */}
                  <td className="p-2 text-center align-middle">
                    <Input
                      className="mx-auto h-9 max-w-[80px] rounded-lg border-border/80 bg-card px-2 text-center font-mono font-semibold text-xs"
                      disabled={isInputsDisabled}
                      onBlur={() => handleCellBlur(dateStr, "break_minutes")}
                      onChange={(e) =>
                        setGridData((prev) => ({
                          ...prev,
                          [dateStr]: {
                            ...prev[dateStr],
                            break_minutes: e.target.value,
                          },
                        }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, dateStr, 1)}
                      placeholder="0"
                      type="number"
                      value={current.break_minutes}
                    />
                  </td>

                  {/* Calculated Hours */}
                  <td className="p-2.5 text-center align-middle font-bold font-mono text-foreground/90 text-sm">
                    {formatHoursToHHMM(current.actual_hours)}
                  </td>

                  {/* Notes Comment */}
                  <td className="p-2 pr-4 align-middle">
                    <Input
                      className="h-9 rounded-lg border-border/80 bg-card/60 px-3 text-xs"
                      onBlur={() => handleCellBlur(dateStr, "notes")}
                      onChange={(e) =>
                        setGridData((prev) => ({
                          ...prev,
                          [dateStr]: {
                            ...prev[dateStr],
                            notes: e.target.value,
                          },
                        }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, dateStr, 4)}
                      placeholder={isDe ? "Notiz..." : "Comment..."}
                      value={current.notes}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sub-helper functions for parsing & formatting
function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) {
    return null;
  }
  const parts = timeStr.split(":");
  if (parts.length < 2) {
    return null;
  }
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function formatTimeInput(val: string): string {
  const clean = val.replace(/[^0-9]/g, "");
  if (!clean) {
    return "";
  }

  if (clean.length <= 2) {
    const hr = Number.parseInt(clean, 10);
    return `${String(Math.min(23, hr)).padStart(2, "0")}:00`;
  }

  const hr = Number.parseInt(clean.slice(0, 2), 10);
  const min = Number.parseInt(clean.slice(2, 4), 10) || 0;
  return `${String(Math.min(23, hr)).padStart(2, "0")}:${String(Math.min(59, min)).padStart(2, "0")}`;
}

function getActiveWorkingHoursVersion(
  dateStr: string,
  workingHours: EmployeeWorkingHours[]
): EmployeeWorkingHours | null {
  for (const wh of workingHours) {
    if (
      wh.start_date <= dateStr &&
      (wh.end_date === null || wh.end_date >= dateStr)
    ) {
      return wh;
    }
  }
  return null;
}

function calculateDailyHours(
  start: string | null,
  end: string | null,
  breakMins: number
): number {
  if (!(start && end)) {
    return 0;
  }
  const inVal = parseTimeToMinutes(start);
  const outVal = parseTimeToMinutes(end);
  if (inVal !== null && outVal !== null) {
    let diff = outVal - inVal;
    if (diff < 0) {
      diff += 24 * 60;
    }
    return Math.round((Math.max(0, diff - breakMins) / 60) * 100) / 100;
  }
  return 0;
}
