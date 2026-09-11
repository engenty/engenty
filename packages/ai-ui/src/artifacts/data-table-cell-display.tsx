import {
  formatTableCell,
  type TableColumn,
  textColumnStyle,
} from "@engenty/ai-core/browser";
import { Badge, cn } from "@engenty/ui-core";
import { Check } from "lucide-react";
import { Streamdown } from "streamdown";

const SELECT_PILL = [
  "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "border-transparent bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
];

function selectIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string");
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

function pillClass(
  column: Extract<TableColumn, { type: "select" }>,
  id: string
) {
  const index = Math.max(
    0,
    column.format.options.findIndex((option) => option.id === id)
  );
  return SELECT_PILL[index % SELECT_PILL.length];
}

const MARKDOWN_PROSE =
  "text-sm [&_p]:my-0 [&_p+p]:mt-1 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_ul]:pl-4 [&_ol]:pl-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

export function DataTableCellDisplay({
  column,
  truncate = true,
  value,
}: {
  column: TableColumn;
  truncate?: boolean;
  value: unknown;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <span aria-hidden className="select-none text-muted-foreground/35">
        —
      </span>
    );
  }
  if (column.type === "boolean") {
    return value === true ? (
      <Check className="size-4 text-foreground" />
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (column.type === "select") {
    const labels = Object.fromEntries(
      column.format.options.map((option) => [option.id, option.label])
    );
    const ids = selectIds(value);
    if (ids.length === 0) {
      return (
        <span aria-hidden className="select-none text-muted-foreground/35">
          —
        </span>
      );
    }
    return (
      <span className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <Badge className={pillClass(column, id)} key={id} variant="secondary">
            {labels[id] ?? id}
          </Badge>
        ))}
      </span>
    );
  }
  if (column.type === "text" && textColumnStyle(column) === "markdown") {
    const markdown = String(value);
    return (
      <div
        className={cn(
          MARKDOWN_PROSE,
          truncate && "line-clamp-3 overflow-hidden"
        )}
      >
        <Streamdown>{markdown}</Streamdown>
      </div>
    );
  }
  const text = formatTableCell(column, value);
  const multiline =
    column.type === "text" && textColumnStyle(column) === "multiline";
  return (
    <span
      className={cn(
        column.type === "number" && "tabular-nums",
        multiline && "whitespace-pre-wrap",
        truncate && multiline && "line-clamp-3",
        truncate && !multiline && "block max-w-[18rem] truncate"
      )}
    >
      {text}
    </span>
  );
}
