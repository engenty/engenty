import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@engenty/ui-core";
import type React from "react";
import { useEffect, useState } from "react";
import type { EmployeeWorkingHours } from "../employment-time-queries.js";

interface WorkingHoursDialogProps {
  onOpenChange: (open: boolean) => void;
  onSave: (record: EmployeeWorkingHours) => Promise<unknown>;
  open: boolean;
  profileId: string;
  record: EmployeeWorkingHours | null; // Null means create mode
}

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DEFAULT_SCHEDULE = {
  monday: { enabled: true, start: "09:00", end: "17:30", break_minutes: 30 },
  tuesday: { enabled: true, start: "09:00", end: "17:30", break_minutes: 30 },
  wednesday: { enabled: true, start: "09:00", end: "17:30", break_minutes: 30 },
  thursday: { enabled: true, start: "09:00", end: "17:30", break_minutes: 30 },
  friday: { enabled: true, start: "09:00", end: "17:30", break_minutes: 30 },
  saturday: { enabled: false, start: "", end: "", break_minutes: 0 },
  sunday: { enabled: false, start: "", end: "", break_minutes: 0 },
};

export function WorkingHoursDialog({
  open,
  onOpenChange,
  onSave,
  record,
  profileId,
}: WorkingHoursDialogProps) {
  const { t, i18n } = useTranslation("team");
  const isDe = i18n.language === "de";

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("40");
  const [schedule, setSchedule] =
    useState<EmployeeWorkingHours["schedule"]>(DEFAULT_SCHEDULE);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize values when record changes or opens
  useEffect(() => {
    if (open) {
      if (record) {
        setStartDate(record.start_date || "");
        setEndDate(record.end_date || "");
        setWeeklyHours(String(record.weekly_hours));
        setSchedule(record.schedule || DEFAULT_SCHEDULE);
      } else {
        const todayStr = new Date().toISOString().split("T")[0];
        setStartDate(todayStr);
        setEndDate("");
        setWeeklyHours("40");
        setSchedule(DEFAULT_SCHEDULE);
      }
    }
  }, [open, record]);

  // Translate weekday names
  const getWeekdayLabel = (day: string): string => {
    const labels: Record<string, { en: string; de: string }> = {
      monday: { en: "Monday", de: "Montag" },
      tuesday: { en: "Tuesday", de: "Dienstag" },
      wednesday: { en: "Wednesday", de: "Mittwoch" },
      thursday: { en: "Thursday", de: "Donnerstag" },
      friday: { en: "Friday", de: "Freitag" },
      saturday: { en: "Saturday", de: "Samstag" },
      sunday: { en: "Sunday", de: "Sonntag" },
    };
    return isDe ? labels[day].de : labels[day].en;
  };

  // Parse time e.g. "09:00" to minutes
  const parseTimeToMinutes = (timeStr: string | null): number | null => {
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
  };

  // Compute daily hours based on start/end/break
  const calculateDailyHours = (
    start: string | null,
    end: string | null,
    breakMins: number
  ): number => {
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
  };

  // Handle weekday changes
  const handleWeekdayChange = (
    day: string,
    field: "enabled" | "start" | "end" | "break_minutes",
    value: any
  ) => {
    setSchedule((prev) => {
      const current = prev[day] || {
        enabled: false,
        start: null,
        end: null,
        break_minutes: 0,
      };
      const updated = { ...current };

      if (field === "enabled") {
        updated.enabled = value;
        if (value) {
          updated.start = current.start || "09:00";
          updated.end = current.end || "17:30";
          updated.break_minutes = current.break_minutes || 30;
        } else {
          updated.start = "";
          updated.end = "";
          updated.break_minutes = 0;
        }
      } else if (field === "start" || field === "end") {
        updated[field] = value;
      } else if (field === "break_minutes") {
        updated.break_minutes = Number.parseInt(value, 10) || 0;
      }

      const next = { ...prev, [day]: updated };

      // Automatically recalculate the sum of daily hours and update weeklyHours input
      let sum = 0;
      for (const d of WEEKDAYS) {
        const item = next[d];
        if (item?.enabled) {
          sum += calculateDailyHours(item.start, item.end, item.break_minutes);
        }
      }
      setWeeklyHours(String(sum));

      return next;
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) {
      return;
    }

    setIsSaving(true);
    try {
      const payload: EmployeeWorkingHours = {
        id: record?.id,
        profile_id: profileId,
        start_date: startDate,
        end_date: endDate || null,
        weekly_hours: Number.parseFloat(weeklyHours) || 0,
        schedule,
      };
      await onSave(payload);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: "700px", width: "calc(100% - 2rem)" }}
      >
        <DialogHeader>
          <DialogTitle>
            {record
              ? isDe
                ? "Normalarbeitszeit bearbeiten"
                : "Edit Regular Working Hours"
              : isDe
                ? "Normalarbeitszeit hinzufügen"
                : "Add Regular Working Hours"}
          </DialogTitle>
        </DialogHeader>

        <form className="space-y-6 py-2" onSubmit={handleFormSubmit}>
          {/* Main Info Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="font-semibold text-muted-foreground text-xs uppercase">
                {isDe ? "Beginndatum" : "Start Date"}
              </Label>
              <Input
                className="h-9.5 text-sm"
                onChange={(e) => setStartDate(e.target.value)}
                required
                type="date"
                value={startDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold text-muted-foreground text-xs uppercase">
                {isDe ? "Enddatum" : "End Date"}
              </Label>
              <Input
                className="h-9.5 text-sm"
                onChange={(e) => setEndDate(e.target.value)}
                placeholder={isDe ? "Offen" : "Open-ended"}
                type="date"
                value={endDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold text-muted-foreground text-xs uppercase">
                {isDe ? "Wochenstunden" : "Weekly Hours"}
              </Label>
              <Input
                className="h-9.5 font-mono font-semibold text-sm"
                onChange={(e) => setWeeklyHours(e.target.value)}
                step="0.1"
                type="number"
                value={weeklyHours}
              />
            </div>
          </div>

          {/* Weekday Schedule Grid */}
          <div className="space-y-3">
            <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {isDe
                ? "Tagesplanung (Soll-Zeiten)"
                : "Weekday Plan (Target Times)"}
            </h4>

            <div className="overflow-x-auto rounded-xl border border-border/60 bg-muted/5 sm:overflow-x-visible">
              <div className="w-full min-w-[540px] divide-y divide-border/50 sm:min-w-0">
                {/* Header Row */}
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr] items-center gap-2.5 bg-muted/20 p-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  <div>{isDe ? "Tag" : "Day"}</div>
                  <div>{isDe ? "Von" : "From"}</div>
                  <div>{isDe ? "Bis" : "To"}</div>
                  <div className="text-center">
                    {isDe ? "Pause (Min)" : "Break (m)"}
                  </div>
                  <div className="pr-2 text-right">
                    {isDe ? "Stunden" : "Hours"}
                  </div>
                </div>

                {/* Weekdays */}
                {WEEKDAYS.map((day) => {
                  const dayPlan = schedule[day] || {
                    enabled: false,
                    start: "",
                    end: "",
                    break_minutes: 0,
                  };
                  const computedHours = calculateDailyHours(
                    dayPlan.start,
                    dayPlan.end,
                    dayPlan.break_minutes
                  );

                  return (
                    <div
                      className={`grid grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr] items-center gap-2.5 p-3 transition-colors ${
                        dayPlan.enabled
                          ? "bg-card/30"
                          : "bg-muted/10 opacity-75"
                      }`}
                      key={day}
                    >
                      {/* Weekday & Checkbox */}
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={dayPlan.enabled}
                          id={`check-${day}`}
                          onCheckedChange={(checked) =>
                            handleWeekdayChange(day, "enabled", !!checked)
                          }
                        />
                        <label
                          className="cursor-pointer select-none font-semibold text-foreground text-sm"
                          htmlFor={`check-${day}`}
                        >
                          {getWeekdayLabel(day)}
                        </label>
                      </div>

                      {/* Inputs when enabled */}
                      {dayPlan.enabled ? (
                        <>
                          <div>
                            <Input
                              className="h-8.5 w-full font-mono font-semibold text-xs"
                              onChange={(e) =>
                                handleWeekdayChange(
                                  day,
                                  "start",
                                  e.target.value
                                )
                              }
                              required
                              type="time"
                              value={dayPlan.start || ""}
                            />
                          </div>

                          <div>
                            <Input
                              className="h-8.5 w-full font-mono font-semibold text-xs"
                              onChange={(e) =>
                                handleWeekdayChange(day, "end", e.target.value)
                              }
                              required
                              type="time"
                              value={dayPlan.end || ""}
                            />
                          </div>

                          <div>
                            <Input
                              className="mx-auto h-8.5 w-20 text-center font-mono font-semibold text-xs"
                              onChange={(e) =>
                                handleWeekdayChange(
                                  day,
                                  "break_minutes",
                                  e.target.value
                                )
                              }
                              required
                              type="number"
                              value={dayPlan.break_minutes}
                            />
                          </div>

                          <div className="pr-2 text-right font-bold font-mono text-foreground/80 text-sm">
                            {computedHours.toFixed(1)} h
                          </div>
                        </>
                      ) : (
                        <div className="col-span-4 pl-1 text-muted-foreground/60 text-xs italic">
                          {isDe ? "Freier Tag" : "Day Off"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2 border-border/40 border-t pt-4 sm:gap-0">
            <Button
              className="h-9.5 rounded-lg px-4 font-semibold text-sm"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {isDe ? "Abbrechen" : "Cancel"}
            </Button>
            <Button
              className="h-9.5 rounded-lg bg-blue-600 px-5 font-semibold text-sm text-white hover:bg-blue-700"
              disabled={isSaving}
              type="submit"
            >
              {isDe ? "Speichern" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
