"use client";

import type * as React from "react";

import { cn } from "../../lib/utils";

interface TableProps extends React.ComponentProps<"table"> {
  /** When true, render table without overflow wrapper (for external scroll containers, e.g. sticky header layouts) */
  noWrapper?: boolean;
}

function Table({ className, noWrapper, ...props }: TableProps) {
  const tableEl = (
    <table
      className={cn(
        "w-full border-separate border-spacing-0 caption-bottom text-sm",
        className
      )}
      data-slot="table"
      {...props}
    />
  );

  if (noWrapper) {
    return tableEl;
  }

  return (
    <div
      className="relative w-full overflow-x-auto"
      data-slot="table-container"
    >
      {tableEl}
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead className={cn(className)} data-slot="table-header" {...props} />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody className={cn(className)} data-slot="table-body" {...props} />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn(
        "ui-canvas-stack-top border-0 bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      data-slot="table-footer"
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group ui-canvas-table-row transition-colors",
        className
      )}
      data-slot="table-row"
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      data-slot="table-head"
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      data-slot="table-cell"
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      className={cn("mt-4 text-muted-foreground text-sm", className)}
      data-slot="table-caption"
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
