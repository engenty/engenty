import type * as React from "react";

import { cn } from "../../../lib/utils";
import { TableCell, TableRow } from "../../ui/table";
import { TABLE_SELECTION_COLUMN_CLASS } from "./table-selection-cell";

export interface AdminListSubheadlineProps extends React.ComponentProps<"p"> {}

/** Group label for admin list/card sections (title case, not sidebar uppercase labels). */
export function AdminListSubheadline({
  children,
  className,
  ...props
}: AdminListSubheadlineProps) {
  return (
    <p
      className={cn(
        "font-heading font-semibold text-foreground text-lg leading-6 tracking-tight",
        className
      )}
      data-slot="admin-list-subheadline"
      {...props}
    >
      {children}
    </p>
  );
}

export interface AdminListSubheadlineRowProps {
  children: React.ReactNode;
  colSpan: number;
  compact?: boolean;
  /** Leave the checkbox column empty so text aligns with the first data column. */
  leadingOffset?: "selection" | "none";
}

/** Shared group divider underline for table subheadline rows and cards section headings. */
export const ADMIN_LIST_SUBHEADLINE_DIVIDER_CLASS = "border-primary border-b-2";

/** Vertical padding around group labels (cards sections; table cells use the `!` override). */
export function adminListSubheadlineSectionPaddingClass(compact = false) {
  return compact ? "py-1.5" : "py-2.5";
}

/** Cards/list section heading band — divider + symmetric padding, no table row background. */
export function adminListSubheadlineSectionClass(compact = false) {
  return cn(
    ADMIN_LIST_SUBHEADLINE_DIVIDER_CLASS,
    adminListSubheadlineSectionPaddingClass(compact)
  );
}

const subheadlineCellPaddingClass = (compact: boolean) =>
  compact ? "!py-1.5" : "!py-2.5";

const subheadlineCellClass = (compact: boolean) =>
  cn(
    ADMIN_LIST_SUBHEADLINE_DIVIDER_CLASS,
    "bg-muted/30",
    subheadlineCellPaddingClass(compact)
  );

/** Full-width table row that introduces a grouped section in admin list tables. */
export function AdminListSubheadlineRow({
  children,
  colSpan,
  compact = false,
  leadingOffset = "selection",
}: AdminListSubheadlineRowProps) {
  const usesSelectionOffset = leadingOffset === "selection" && colSpan > 1;
  const contentColSpan = usesSelectionOffset ? colSpan - 1 : colSpan;

  return (
    <TableRow
      className="border-b-0 bg-muted/30 hover:bg-muted/30"
      data-slot="admin-list-subheadline-row"
    >
      {usesSelectionOffset ? (
        <TableCell
          aria-hidden
          className={cn(
            TABLE_SELECTION_COLUMN_CLASS,
            subheadlineCellClass(compact)
          )}
        />
      ) : null}
      <TableCell
        className={subheadlineCellClass(compact)}
        colSpan={contentColSpan}
      >
        <AdminListSubheadline>{children}</AdminListSubheadline>
      </TableCell>
    </TableRow>
  );
}
