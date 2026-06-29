import { Input, Label } from "@engenty/ui-core";
import { useCallback } from "react";
import type { PresetSchedule } from "./schedule-cron.js";

export interface SchedulePresetPickerProps {
  locale?: string;
  onChange: (value: PresetSchedule) => void;
  value: PresetSchedule;
}

const DAYS_EN = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const DAYS_DE = [
  { value: 0, label: "Sonntag" },
  { value: 1, label: "Montag" },
  { value: 2, label: "Dienstag" },
  { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" },
  { value: 5, label: "Freitag" },
  { value: 6, label: "Samstag" },
];

export function SchedulePresetPicker({
  value,
  onChange,
  locale = "en",
}: SchedulePresetPickerProps) {
  const isDe = locale.startsWith("de");
  const days = isDe ? DAYS_DE : DAYS_EN;

  const handleTypeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const type = event.target.value as PresetSchedule["type"];
      onChange({
        type,
        hour: value.hour ?? 9,
        minute: value.minute ?? 0,
        dayOfWeek: value.dayOfWeek ?? 1,
        cron: value.cron ?? "0 9 * * 1-5",
      });
    },
    [value, onChange]
  );

  const handleTimeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const [hStr, mStr] = event.target.value.split(":");
      const hour = Number.parseInt(hStr || "9", 10);
      const minute = Number.parseInt(mStr || "0", 10);
      onChange({
        ...value,
        hour,
        minute,
      });
    },
    [value, onChange]
  );

  const handleDayChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const dayOfWeek = Number.parseInt(event.target.value, 10);
      onChange({
        ...value,
        dayOfWeek,
      });
    },
    [value, onChange]
  );

  const handleCronChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...value,
        cron: event.target.value,
      });
    },
    [value, onChange]
  );

  const timeValue = `${String(value.hour ?? 9).padStart(2, "0")}:${String(value.minute ?? 0).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="preset-type">{isDe ? "Intervall" : "Interval"}</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          id="preset-type"
          onChange={handleTypeChange}
          value={value.type}
        >
          <option value="hourly">{isDe ? "Stündlich" : "Hourly"}</option>
          <option value="daily">{isDe ? "Täglich" : "Daily"}</option>
          <option value="weekdays">
            {isDe ? "Werktags (Mo-Fr)" : "Weekdays (Mon-Fri)"}
          </option>
          <option value="weekly">{isDe ? "Wöchentlich" : "Weekly"}</option>
          <option value="custom">
            {isDe ? "Eigener Cron" : "Custom Cron"}
          </option>
        </select>
      </div>

      {value.type === "weekly" && (
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="preset-day">
            {isDe ? "Wochentag" : "Day of week"}
          </Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            id="preset-day"
            onChange={handleDayChange}
            value={value.dayOfWeek ?? 1}
          >
            {days.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {(value.type === "daily" ||
        value.type === "weekdays" ||
        value.type === "weekly") && (
        <div className="w-32 space-y-1.5">
          <Label htmlFor="preset-time">{isDe ? "Uhrzeit" : "Time"}</Label>
          <Input
            id="preset-time"
            onChange={handleTimeChange}
            type="time"
            value={timeValue}
          />
        </div>
      )}

      {value.type === "custom" && (
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="preset-cron">
            {isDe ? "Cron-Ausdruck" : "Cron Expression"}
          </Label>
          <Input
            id="preset-cron"
            onChange={handleCronChange}
            placeholder="0 9 * * 1-5"
            value={value.cron ?? ""}
          />
        </div>
      )}
    </div>
  );
}
