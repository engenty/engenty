export interface PresetSchedule {
  cron?: string;
  dayOfWeek?: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  hour: number;
  minute: number;
  type: "hourly" | "daily" | "weekly" | "weekdays" | "custom";
}

const DAYS_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAYS_DE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

export function presetToCron(preset: PresetSchedule): string {
  if (preset.type === "hourly") {
    return "0 * * * *";
  }
  if (preset.type === "custom") {
    return preset.cron || "* * * * *";
  }

  const date = new Date();
  date.setFullYear(2026, 5, 1); // June 1, 2026 is a Monday
  date.setHours(preset.hour, preset.minute, 0, 0);

  if (preset.type === "weekly" && preset.dayOfWeek !== undefined) {
    const currentDay = date.getDay();
    const diff = preset.dayOfWeek - currentDay;
    date.setDate(date.getDate() + diff);
  }

  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();
  const utcDayOfWeek = date.getUTCDay();

  if (preset.type === "daily") {
    return `${utcMinute} ${utcHour} * * *`;
  }
  if (preset.type === "weekdays") {
    return `${utcMinute} ${utcHour} * * 1-5`;
  }
  if (preset.type === "weekly") {
    return `${utcMinute} ${utcHour} * * ${utcDayOfWeek}`;
  }
  return "* * * * *";
}

/**
 * `convertUtcToLocal` (default true) matches `presetToCron`, which writes the
 * cron in UTC. A trigger that carries an explicit IANA `timezone` has its cron
 * written in THAT zone's local time instead — pass `false` so the hours read
 * back verbatim rather than being shifted as if they were UTC.
 */
export function cronToPreset(
  cron: string,
  convertUtcToLocal = true
): PresetSchedule {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { type: "custom", hour: 0, minute: 0, cron };
  }
  const [minStr, hourStr, domStr, monthStr, dowStr] = parts;

  if (
    minStr === "0" &&
    hourStr === "*" &&
    domStr === "*" &&
    monthStr === "*" &&
    dowStr === "*"
  ) {
    return { type: "hourly", hour: 0, minute: 0 };
  }

  const min = Number.parseInt(minStr || "0", 10);
  const hour = Number.parseInt(hourStr || "0", 10);

  if (Number.isNaN(min) || Number.isNaN(hour)) {
    return { type: "custom", hour: 0, minute: 0, cron };
  }

  const date = new Date();
  date.setFullYear(2026, 5, 1); // June 1, 2026 is a Monday
  date.setUTCHours(hour, min, 0, 0);

  const localHour = convertUtcToLocal ? date.getHours() : hour;
  const localMinute = convertUtcToLocal ? date.getMinutes() : min;

  if (domStr === "*" && monthStr === "*") {
    if (dowStr === "*") {
      return { type: "daily", hour: localHour, minute: localMinute };
    }
    if (dowStr === "1-5") {
      return { type: "weekdays", hour: localHour, minute: localMinute };
    }
    const dow = Number.parseInt(dowStr || "0", 10);
    if (!Number.isNaN(dow) && dow >= 0 && dow <= 6) {
      if (!convertUtcToLocal) {
        return {
          type: "weekly",
          hour: localHour,
          minute: localMinute,
          dayOfWeek: dow,
        };
      }
      const utcDay = date.getUTCDay();
      const diff = dow - utcDay;
      date.setUTCDate(date.getUTCDate() + diff);
      const localDayOfWeek = date.getDay();
      return {
        type: "weekly",
        hour: localHour,
        minute: localMinute,
        dayOfWeek: localDayOfWeek,
      };
    }
  }

  return { type: "custom", hour: 0, minute: 0, cron };
}

/**
 * `timezone` set means the cron's hours are already local to that zone (the
 * agent-created path): render them verbatim, suffixed with the zone. Without
 * it the cron is UTC (the form's preset path) and converts to viewer-local.
 */
export function cronToHumanLabel(
  cron: string,
  locale = "en",
  timezone?: string | null,
  options: { showTimezone?: boolean } = {}
): string {
  const preset = cronToPreset(cron, !timezone);
  const tzSuffix =
    timezone && options.showTimezone !== false ? ` (${timezone})` : "";
  const formatTime = (h: number, m: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}`;
  };

  const isDe = locale.startsWith("de");

  switch (preset.type) {
    case "hourly":
      return isDe ? "Stündlich" : "Hourly";
    case "daily":
      return isDe
        ? `Täglich um ${formatTime(preset.hour, preset.minute)}${tzSuffix}`
        : `Daily at ${formatTime(preset.hour, preset.minute)}${tzSuffix}`;
    case "weekdays":
      return isDe
        ? `Werktags um ${formatTime(preset.hour, preset.minute)}${tzSuffix}`
        : `Weekdays at ${formatTime(preset.hour, preset.minute)}${tzSuffix}`;
    case "weekly": {
      const dayName = isDe
        ? DAYS_DE[preset.dayOfWeek ?? 1]
        : DAYS_EN[preset.dayOfWeek ?? 1];
      return isDe
        ? `Wöchentlich am ${dayName} um ${formatTime(preset.hour, preset.minute)}${tzSuffix}`
        : `Weekly on ${dayName} at ${formatTime(preset.hour, preset.minute)}${tzSuffix}`;
    }
    default:
      return timezone ? `${cron}${tzSuffix}` : cron;
  }
}
