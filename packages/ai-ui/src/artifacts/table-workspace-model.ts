import {
  columnEdit,
  type TableColumn,
  textColumnStyle,
} from "@engenty/ai-core/browser";

export interface TableWorkspaceRow {
  cells: Record<string, unknown>;
  id: string;
}

export type TableSheetDraft =
  | { kind: "create" }
  | { kind: "edit"; row: TableWorkspaceRow };

export function columnHint(column: TableColumn): string | null {
  switch (column.type) {
    case "number":
      return column.format.style === "currency"
        ? (column.format.currency ?? "currency")
        : column.format.style;
    case "date":
      if (column.format.kind === "time") {
        return column.format.timePrecision === "hours" ? "hour" : "time";
      }
      return column.format.kind;
    case "duration":
      return column.format.display;
    case "select":
      return column.format.allowCustom ? "select +" : "select";
    case "boolean":
      return "boolean";
    case "text": {
      const style = textColumnStyle(column);
      if (style === "single") {
        return columnEdit(column) === "popout" ? "text" : null;
      }
      return style;
    }
    default:
      return null;
  }
}

const MS: Record<string, number> = {
  days: 86_400_000,
  hours: 3_600_000,
  milliseconds: 1,
  minutes: 60_000,
  seconds: 1000,
};

export function formValueFromCell(
  column: TableColumn,
  value: unknown
): unknown {
  if (value === null || value === undefined) {
    if (column.type === "boolean") {
      return false;
    }
    if (column.type === "select" && column.format.multiple) {
      return [];
    }
    return "";
  }
  if (column.type === "duration" && typeof value === "number") {
    const unit = MS[column.format.inputUnit] ?? 1;
    return String(value / unit);
  }
  if (column.type === "number" && typeof value === "number") {
    return String(value);
  }
  if (column.type === "boolean") {
    return value === true;
  }
  return value;
}

export function emptyFormValues(
  columns: readonly TableColumn[]
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const column of columns) {
    values[column.id] = formValueFromCell(column, null);
  }
  return values;
}

export function formValuesFromRow(
  columns: readonly TableColumn[],
  cells: Record<string, unknown>
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const column of columns) {
    values[column.id] = formValueFromCell(column, cells[column.id]);
  }
  return values;
}
