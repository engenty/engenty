"use client";

import { MoreVertical } from "lucide-react";
import type * as React from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { TableCell } from "../../ui/table";

interface TableRowActionsProps {
  /** Align dropdown to start or end */
  align?: "start" | "end" | "center";
  /** Content of the dropdown (DropdownMenuItem, etc.) */
  children: React.ReactNode;
  className?: string;
  /** Compact mode reduces padding */
  compact?: boolean;
  /** Stop row click propagation when opening menu */
  stopPropagation?: boolean;
}

/**
 * Wrapper for the optional 3-dot row actions column.
 * Renders a TableCell with a dropdown trigger. Use stopPropagation so
 * row click (e.g. navigate) does not fire when opening the menu.
 */
export function TableRowActions({
  children,
  compact = false,
  stopPropagation = true,
  align = "end",
  className,
}: TableRowActionsProps) {
  const handleClick = stopPropagation
    ? (e: React.MouseEvent) => e.stopPropagation()
    : undefined;

  return (
    <TableCell
      className={cn(
        "w-[40px] px-1 text-right",
        compact && "!py-1.5",
        className
      )}
      onClick={handleClick}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Row actions"
            className="h-7 w-7"
            onClick={handleClick}
            size="icon"
            variant="ghost"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} onClick={handleClick}>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>
  );
}
