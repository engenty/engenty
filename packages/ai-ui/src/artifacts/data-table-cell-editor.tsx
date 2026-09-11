import { type TableColumn, textColumnStyle } from "@engenty/ai-core/browser";
import {
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@engenty/ui-core";
import { type ReactNode, useEffect, useState } from "react";
import { TableMarkdownEditor } from "./data-table-markdown-editor.js";
import { formValueFromCell } from "./table-workspace-model.js";

export function toCommitValue(column: TableColumn, draft: unknown): unknown {
  if (column.type === "boolean") {
    return draft === true;
  }
  if (column.type === "select" && column.format.multiple) {
    return Array.isArray(draft) ? draft : [];
  }
  if (typeof draft === "string" && draft.trim() === "") {
    return null;
  }
  return draft;
}

function SelectEditor({
  column,
  onChange,
  value,
}: {
  column: Extract<TableColumn, { type: "select" }>;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  if (column.format.multiple) {
    const selected = new Set(
      Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : typeof value === "string" && value
          ? [value]
          : []
    );
    return (
      <div className="flex max-h-48 flex-col gap-1 overflow-auto">
        {column.format.options.map((option) => (
          <label
            className="flex items-center gap-2 text-sm"
            htmlFor={`select-option-${option.id}`}
            key={option.id}
          >
            <Checkbox
              checked={selected.has(option.id)}
              id={`select-option-${option.id}`}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (checked === true) {
                  next.add(option.id);
                } else {
                  next.delete(option.id);
                }
                onChange([...next]);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  const current = typeof value === "string" ? value : "";
  return (
    <Select onValueChange={(next) => onChange(next || null)} value={current}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {column.format.options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CellField({
  column,
  onChange,
  value,
}: {
  column: TableColumn;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  if (column.type === "boolean") {
    return (
      <Switch
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  }
  if (column.type === "select") {
    return <SelectEditor column={column} onChange={onChange} value={value} />;
  }
  if (column.type === "text") {
    const style = textColumnStyle(column);
    const text = typeof value === "string" ? value : "";
    if (style === "markdown") {
      return (
        <TableMarkdownEditor
          className="rounded-md border bg-card px-2.5 py-1.5"
          onChange={onChange}
          placeholder={column.name}
          value={text}
        />
      );
    }
    if (style === "multiline") {
      return (
        <Textarea
          className="min-h-20"
          onChange={(event) => onChange(event.target.value)}
          value={text}
        />
      );
    }
    return (
      <Input onChange={(event) => onChange(event.target.value)} value={text} />
    );
  }
  const inputType =
    column.type === "number" || column.type === "duration"
      ? "number"
      : column.type === "date"
        ? column.format.kind === "date"
          ? "date"
          : column.format.kind === "time"
            ? "time"
            : "datetime-local"
        : "text";
  let display =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (
    column.type === "date" &&
    column.format.kind === "datetime" &&
    display.includes("T")
  ) {
    display = display.slice(0, 16);
  }
  return (
    <Input
      onChange={(event) => onChange(event.target.value)}
      step={
        column.type === "number" && column.format.style === "integer"
          ? "1"
          : undefined
      }
      type={inputType}
      value={display}
    />
  );
}

export function DataTableCellEditor({
  column,
  onCommit,
  onOpenRecord,
  open,
  onOpenChange,
  trigger,
  value,
}: {
  column: TableColumn;
  onCommit: (value: unknown) => void;
  onOpenChange: (open: boolean) => void;
  onOpenRecord?: () => void;
  open: boolean;
  trigger: ReactNode;
  value: unknown;
}) {
  const [draft, setDraft] = useState(() => formValueFromCell(column, value));
  useEffect(() => {
    if (open) {
      setDraft(formValueFromCell(column, value));
    }
  }, [column, open, value]);

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      <PopoverContent
        className={
          column.type === "text" && textColumnStyle(column) === "markdown"
            ? "w-[28rem] gap-3 p-3"
            : column.type === "text" && textColumnStyle(column) === "multiline"
              ? "w-96 gap-3 p-3"
              : "w-80 gap-3 p-3"
        }
      >
        <p className="font-medium text-muted-foreground text-xs">
          {column.name}
        </p>
        <CellField column={column} onChange={setDraft} value={draft} />
        <div className="flex items-center justify-end gap-2">
          {onOpenRecord ? (
            <Button
              className="mr-auto h-7 px-2 text-xs"
              onClick={() => {
                onOpenChange(false);
                onOpenRecord();
              }}
              type="button"
              variant="ghost"
            >
              Open record
            </Button>
          ) : null}
          <Button
            className="h-7 px-2.5"
            onClick={() => {
              onCommit(toCommitValue(column, draft));
              onOpenChange(false);
            }}
            size="sm"
            type="button"
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { CellField };
