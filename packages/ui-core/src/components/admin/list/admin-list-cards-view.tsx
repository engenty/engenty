"use client";

import { useRef } from "react";
import { cn } from "../../../lib/utils";
import {
  AdminListPagination,
  type AdminListPaginationProps,
} from "./admin-list-pagination";
import { useListScrollState } from "./use-list-scroll-state";

export interface AdminListCardsViewProps {
  /** Soft fade at the bottom edge when content overflows below the fold. */
  bottomFade?: boolean;
  children: React.ReactNode;
  /** Extra classes on the scroll area (e.g. p-4). */
  contentClassName?: string;
  /** Rendered above the elevated cards shell (inherits page canvas background). */
  header?: React.ReactNode;
  /** Extra classes on the header container. */
  headerClassName?: string;
  /** When set, renders the footer pagination bar. */
  pagination?: AdminListPaginationProps;
  /** "card" adds bordered card shell (team, offers, invoices). */
  variant?: "default" | "card";
}

export function AdminListCardsView({
  children,
  bottomFade = false,
  contentClassName,
  header,
  headerClassName,
  pagination,
  variant = "default",
}: AdminListCardsViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { hasMoreBelow } = useListScrollState(scrollRef);
  /** Card variant mirrors `AdminListTableView` (gap-4, py-2 header) so table/card toggles do not jump. */
  const headerRowClassName =
    variant === "card"
      ? "flex shrink-0 flex-wrap items-center gap-2 py-2"
      : "flex shrink-0 flex-wrap items-center gap-2 px-3 py-2";

  const headerEl =
    header == null ? null : (
      <div className={cn(headerRowClassName, headerClassName)}>{header}</div>
    );

  const footerEl =
    pagination == null ? null : (
      <div className="ui-canvas-stack-top flex shrink-0 border-0 px-3 py-2">
        <AdminListPagination {...pagination} />
      </div>
    );

  const inner = (
    <div className="relative min-h-0 flex-1">
      <div
        className={cn("h-full overflow-auto", contentClassName)}
        ref={scrollRef}
      >
        {children}
      </div>
      {bottomFade ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-background to-transparent transition-opacity duration-200",
            hasMoreBelow ? "opacity-100" : "opacity-0"
          )}
        />
      ) : null}
    </div>
  );

  if (variant === "card") {
    const cardShell = (
      <div className="ui-canvas-elevated flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border-0">
        {inner}
        {footerEl}
      </div>
    );

    if (headerEl == null) {
      return cardShell;
    }

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {headerEl}
        {cardShell}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {headerEl}
      {inner}
      {footerEl}
    </div>
  );
}
