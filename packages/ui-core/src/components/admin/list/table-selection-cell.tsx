"use client";

import { useCallback } from "react";
import { cn } from "../../../lib/utils";
import { Checkbox } from "../../ui/checkbox";
import { TableCell, TableHead } from "../../ui/table";

/** Width/padding for the bulk-select checkbox column (header, cell, and subheadline spacer). */
export const TABLE_SELECTION_COLUMN_CLASS = "w-[36px] min-w-[30px] px-0";

/** Classes for sticky table header row (use on TableHeader).
 * [&_th]:bg-card ensures each header cell has opaque background so row data doesn't show through when scrolling.
 * Header/data separator is each `th` bottom border (`ui-canvas-table-row`); avoid `[&_th]:border-b-0` on this row. */
export const STICKY_HEADER_CLASS =
  "ui-canvas-sticky-table-header sticky top-0 z-20 [&_th]:bg-card";

/** Classes for sticky checkbox column (header or cell) */
export const STICKY_CHECKBOX_HEADER_CLASS = "sticky left-0 z-30 bg-card";
/** Match `TableRow` hover wash under sticky checkbox (opaque `bg-card` would otherwise clip it). */
export const STICKY_CHECKBOX_CELL_CLASS =
  "sticky left-0 z-10 bg-card group-hover:bg-muted/50 group-data-[state=selected]:bg-muted/50";

interface TableSelectionHeaderProps {
  /** Accessible label */
  "aria-label"?: string;
  checked: boolean | "indeterminate";
  className?: string;
  /** Compact mode reduces padding */
  compact?: boolean;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
  /** Whether to use sticky left positioning */
  sticky?: boolean;
}

export function TableSelectionHeader({
  checked,
  onCheckedChange,
  sticky = true,
  compact = false,
  "aria-label": ariaLabel = "Select all",
  className,
}: TableSelectionHeaderProps) {
  return (
    <TableHead
      className={cn(
        TABLE_SELECTION_COLUMN_CLASS,
        sticky && STICKY_CHECKBOX_HEADER_CLASS,
        compact && "[&]:!py-1.5 h-8",
        className
      )}
    >
      <div className="flex w-full justify-center">
        <Checkbox
          aria-label={ariaLabel}
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </TableHead>
  );
}

interface TableSelectionCellProps {
  /** Accessible label */
  "aria-label"?: string;
  checked: boolean;
  className?: string;
  /** Compact mode reduces padding */
  compact?: boolean;
  /** Show checkbox on row hover (opacity transition) */
  hoverReveal?: boolean;
  id: string;
  onCheckedChange: (id: string, checked: boolean) => void;
  /** Whether to use sticky left positioning */
  sticky?: boolean;
}

export function TableSelectionCell({
  id,
  checked,
  onCheckedChange,
  sticky = true,
  compact = false,
  hoverReveal = true,
  "aria-label": ariaLabel = "Select row",
  className,
}: TableSelectionCellProps) {
  const handleChange = useCallback(
    (value: boolean | "indeterminate") => {
      onCheckedChange(id, value === true);
    },
    [id, onCheckedChange]
  );

  return (
    <TableCell
      className={cn(
        TABLE_SELECTION_COLUMN_CLASS,
        sticky && STICKY_CHECKBOX_CELL_CLASS,
        compact && "!py-1.5",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "flex w-full justify-center transition-opacity",
          checked
            ? "opacity-100"
            : hoverReveal
              ? "opacity-0 group-hover:opacity-100"
              : "opacity-100"
        )}
      >
        <Checkbox
          aria-label={ariaLabel}
          checked={checked}
          onCheckedChange={handleChange}
        />
      </div>
    </TableCell>
  );
}
