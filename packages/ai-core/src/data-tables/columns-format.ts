import type {
  DateFormat,
  DurationFormat,
  NumberFormat,
  TableColumn,
} from "./columns.js";

const MS_HOUR = 3_600_000;
const MS_MINUTE = 60_000;
const MS_SECOND = 1000;

function fractionDigits(format: NumberFormat): number {
  if (format.fractionDigits !== undefined) {
    return format.fractionDigits;
  }
  return format.style === "integer" ? 0 : 2;
}

export function formatNumberCell(
  value: unknown,
  format: NumberFormat,
  locale = "en"
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  const digits = fractionDigits(format);
  const grouping = format.grouping !== false;
  if (format.style === "percent") {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
      style: "percent",
      useGrouping: grouping,
    }).format(value);
  }
  if (format.style === "currency" && format.currency) {
    return new Intl.NumberFormat(locale, {
      currency: format.currency,
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
      style: "currency",
      useGrouping: grouping,
    }).format(value);
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    useGrouping: grouping,
  }).format(value);
}

export function formatDateCell(
  value: unknown,
  format: DateFormat,
  locale = "en"
): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }
  if (format.kind === "time") {
    return formatClock(value, format.timePrecision ?? "minutes");
  }
  if (format.dateStyle === "iso") {
    return format.kind === "date" ? value.slice(0, 10) : value;
  }
  const date =
    format.kind === "date" ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const dateStyle = format.dateStyle ?? "medium";
  if (format.kind === "date") {
    return new Intl.DateTimeFormat(locale, { dateStyle }).format(date);
  }
  const timePrecision = format.timePrecision ?? "minutes";
  return new Intl.DateTimeFormat(locale, {
    dateStyle,
    timeStyle: timePrecision === "hours" ? "short" : "medium",
  }).format(date);
}

function formatClock(
  value: string,
  precision: NonNullable<DateFormat["timePrecision"]>
): string {
  const [hours = "0", minutes = "00", seconds = "00"] = value.split(":");
  if (precision === "hours") {
    return `${hours.padStart(2, "0")}:00`;
  }
  if (precision === "minutes") {
    return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
  }
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}

export function formatDurationCell(
  value: unknown,
  format: DurationFormat
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  const ms = Math.max(0, Math.round(value));
  if (format.display === "iso") {
    return toIsoDuration(ms);
  }
  if (format.display === "minutes") {
    return `${Math.round(ms / MS_MINUTE)} min`;
  }
  if (format.display === "hours") {
    return `${(ms / MS_HOUR).toFixed(2)} h`;
  }
  if (format.display === "decimal-hours") {
    return (ms / MS_HOUR).toFixed(2);
  }
  const hours = Math.floor(ms / MS_HOUR);
  const minutes = Math.floor((ms % MS_HOUR) / MS_MINUTE);
  const seconds = Math.floor((ms % MS_MINUTE) / MS_SECOND);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function toIsoDuration(ms: number): string {
  const hours = Math.floor(ms / MS_HOUR);
  const minutes = Math.floor((ms % MS_HOUR) / MS_MINUTE);
  const seconds = Math.floor((ms % MS_MINUTE) / MS_SECOND);
  const dayPart = hours >= 24 ? `P${Math.floor(hours / 24)}D` : "P";
  const h = hours % 24;
  return `${dayPart}T${h}H${minutes}M${seconds}S`;
}

export function formatTableCell(
  column: TableColumn,
  value: unknown,
  locale = "en"
): string {
  if (value === null || value === undefined) {
    return "";
  }
  switch (column.type) {
    case "number":
      return formatNumberCell(value, column.format, locale);
    case "date":
      return formatDateCell(value, column.format, locale);
    case "duration":
      return formatDurationCell(value, column.format);
    case "boolean":
      return value === true ? "true" : value === false ? "false" : "";
    case "select":
      return formatSelectCell(column, value);
    default:
      return String(value);
  }
}

function formatSelectCell(
  column: Extract<TableColumn, { type: "select" }>,
  value: unknown
): string {
  const ids = Array.isArray(value) ? value : [value];
  const labels = column.format.options.reduce<Record<string, string>>(
    (acc, option) => {
      acc[option.id] = option.label;
      return acc;
    },
    {}
  );
  return ids
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => labels[id] ?? id)
    .join(", ");
}
