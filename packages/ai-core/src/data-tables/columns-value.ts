import {
  type DateFormat,
  type DurationFormat,
  type DurationUnit,
  type SelectFormat,
  type TableColumn,
  tableColumnsSchema,
  textColumnStyle,
} from "./columns.js";

export class TableColumnValueError extends Error {
  readonly code = "invalid_table_value";
  readonly columnId: string;
  constructor(columnId: string, message: string) {
    super(message);
    this.name = "TableColumnValueError";
    this.columnId = columnId;
  }
}

const MS: Record<DurationUnit, number> = {
  days: 86_400_000,
  hours: 3_600_000,
  milliseconds: 1,
  minutes: 60_000,
  seconds: 1000,
};

export function parseTableColumns(input: unknown): TableColumn[] {
  return tableColumnsSchema.parse(input);
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function optionIds(format: SelectFormat): Set<string> {
  return new Set(format.options.map((option) => option.id));
}

function coerceDurationMs(value: unknown, format: DurationFormat): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value * MS[format.inputUnit];
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    const raw = value as { unit?: unknown; value?: unknown };
    if (typeof raw.value === "number" && Number.isFinite(raw.value)) {
      const unit =
        typeof raw.unit === "string" && raw.unit in MS
          ? (raw.unit as DurationUnit)
          : format.inputUnit;
      return raw.value * MS[unit];
    }
  }
  if (typeof value === "string") {
    const iso = parseIsoDurationMs(value.trim());
    if (iso !== null) {
      return iso;
    }
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber * MS[format.inputUnit];
    }
  }
  throw new Error("duration must be a number in the column's input unit");
}

function parseIsoDurationMs(raw: string): number | null {
  const match =
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
      raw
    );
  if (!match) {
    return null;
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  if (days + hours + minutes + seconds === 0 && raw === "P") {
    return null;
  }
  return (
    days * MS.days +
    hours * MS.hours +
    minutes * MS.minutes +
    seconds * MS.seconds
  );
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

function coerceDate(value: unknown, format: DateFormat): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("date must be a string");
  }
  const raw = String(value).trim();
  if (format.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error("date must be YYYY-MM-DD");
    }
    return raw;
  }
  if (format.kind === "datetime") {
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      throw new Error("datetime must be an ISO-8601 timestamp");
    }
    return new Date(parsed).toISOString();
  }
  const precision = format.timePrecision ?? "minutes";
  const time = normalizeClockTime(raw, precision);
  if (!time) {
    throw new Error(
      precision === "hours"
        ? "time must be an hour (0–23 or HH:00)"
        : "time must be HH:mm"
    );
  }
  return time;
}

function normalizeClockTime(
  raw: string,
  precision: NonNullable<DateFormat["timePrecision"]>
): string | null {
  const hourOnly = /^(\d{1,2})$/.exec(raw);
  const hm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  const match = hourOnly ?? hm;
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = hourOnly ? 0 : Number(match[2] ?? 0);
  const seconds = hourOnly ? 0 : Number(match[3] ?? 0);
  if (hours < 0 || hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }
  if (precision === "hours") {
    return `${pad(hours)}:00`;
  }
  if (precision === "minutes") {
    return `${pad(hours)}:${pad(minutes)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function coerceSelect(value: unknown, format: SelectFormat): string | string[] {
  const allowed = optionIds(format);
  const asList = format.multiple
    ? Array.isArray(value)
      ? value
      : [value]
    : [value];
  const ids = asList.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error("select values must be non-empty strings");
    }
    const id = item.trim();
    if (!(format.allowCustom || allowed.has(id))) {
      throw new Error(`"${id}" is not an allowed value`);
    }
    return id;
  });
  return format.multiple ? ids : (ids[0] ?? "");
}

function coerceNumber(value: unknown, integer: boolean): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error("number must be finite");
  }
  if (integer && !Number.isInteger(n)) {
    throw new Error("this column only accepts whole numbers");
  }
  return n;
}

function coerceText(column: TableColumn, value: unknown): string {
  const text = String(value);
  if (textColumnStyle(column) === "single") {
    return text.replace(/[\r\n]+/g, " ");
  }
  return text;
}

/** Turn a writer-facing cell into the stored JSON value for one column. */
export function coerceColumnValue(
  column: TableColumn,
  value: unknown
): unknown {
  if (isBlank(value)) {
    if (column.required) {
      throw new TableColumnValueError(
        column.id,
        `"${column.name}" is required`
      );
    }
    return null;
  }
  try {
    switch (column.type) {
      case "text":
        return coerceText(column, value);
      case "boolean":
        if (typeof value === "boolean") {
          return value;
        }
        if (value === "true" || value === "1") {
          return true;
        }
        if (value === "false" || value === "0") {
          return false;
        }
        throw new Error("boolean must be true or false");
      case "number":
        return coerceNumber(value, column.format.style === "integer");
      case "date":
        return coerceDate(value, column.format);
      case "duration":
        return coerceDurationMs(value, column.format);
      case "select":
        return coerceSelect(value, column.format);
      default:
        return value;
    }
  } catch (error) {
    throw new TableColumnValueError(
      column.id,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export function coerceRowValues(
  columns: readonly TableColumn[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const known = new Set(columns.map((column) => column.id));
  const extra = Object.keys(values).filter((key) => !known.has(key));
  if (extra.length > 0) {
    throw new TableColumnValueError(
      extra[0] ?? "",
      `unknown column "${extra[0]}"`
    );
  }
  const next: Record<string, unknown> = {};
  for (const column of columns) {
    next[column.id] = coerceColumnValue(column, values[column.id]);
  }
  return next;
}

export function mergeRowValues(
  columns: readonly TableColumn[],
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return coerceRowValues(columns, { ...current, ...patch });
}
