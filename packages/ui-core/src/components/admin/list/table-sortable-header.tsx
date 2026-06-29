"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type * as React from "react";
import { cn } from "../../../lib/utils";
import { TableHead } from "../../ui/table";

export type SortOrder = "asc" | "desc";

interface TableSortableHeaderProps<TSortColumn extends string> {
  /** Header content (label) */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
  /** Column key used for sorting (backend param) */
  column: TSortColumn;
  /** Compact mode reduces padding */
  compact?: boolean;
  /** Called when header is clicked; modules toggle/cycle sort */
  onSort: (column: TSortColumn) => void;
  /** Currently active sort column */
  sortBy: TSortColumn | null;
  /** Current sort order */
  sortOrder: SortOrder;
}

export function TableSortableHeader<TSortColumn extends string>({
  column,
  sortBy,
  sortOrder,
  onSort,
  children,
  compact = false,
  className,
}: TableSortableHeaderProps<TSortColumn>) {
  const isActive = sortBy === column;

  const icon = isActive ? (
    sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    )
  ) : (
    <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
  );

  return (
    <TableHead
      className={cn(
        "group cursor-pointer select-none text-left font-medium transition-colors hover:bg-muted/20",
        isActive ? "text-foreground/90" : "text-muted-foreground/85",
        compact && "!py-1.5 h-8",
        className
      )}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{children}</span>
        <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          {icon}
        </span>
      </div>
    </TableHead>
  );
}
