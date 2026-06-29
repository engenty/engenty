"use client";

import { useRef } from "react";
import { cn } from "../../../lib/utils";
import {
  AdminListPagination,
  type AdminListPaginationProps,
} from "./admin-list-pagination";
import { useListScrollState } from "./use-list-scroll-state";

export interface AdminListTableViewProps {
  /** Soft fade at the bottom edge when content overflows below the fold. */
  bottomFade?: boolean;
  children: React.ReactNode;
  /** Rendered above the elevated list card (inherits page canvas background). */
  header?: React.ReactNode;
  /** Extra classes on the header container. */
  headerClassName?: string;
  /** When set, renders the footer pagination bar. Omit for unpaginated tables. */
  pagination?: AdminListPaginationProps;
  /** Extra classes on the scroll container (e.g. scrollbar-none, overscroll). */
  scrollClassName?: string;
  /** Drop a soft shadow under the sticky header once the list is scrolled. */
  stickyHeaderShadow?: boolean;
  /** If true, renders without the elevated white card wrapper. */
  transparent?: boolean;
}

export function AdminListTableView({
  children,
  bottomFade = false,
  header,
  headerClassName,
  scrollClassName,
  pagination,
  stickyHeaderShadow = false,
  transparent = false,
}: AdminListTableViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrolled, hasMoreBelow } = useListScrollState(scrollRef);
  const tableCard = (
    <div
      className={cn(
        transparent
          ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          : "ui-canvas-elevated flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border-0 bg-card"
      )}
    >
      <div className="relative min-h-0 flex-1">
        <div
          className={cn("h-full overflow-auto", scrollClassName)}
          data-list-scrolled={
            stickyHeaderShadow && scrolled ? "true" : undefined
          }
          ref={scrollRef}
        >
          <div className="min-w-full">{children}</div>
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
      {pagination ? (
        <div
          className={cn(
            "flex shrink-0 border-0 px-3 py-2",
            transparent ? "bg-transparent" : "ui-canvas-stack-top"
          )}
        >
          <AdminListPagination {...pagination} />
        </div>
      ) : null}
    </div>
  );

  if (header == null) {
    return tableCard;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-2 py-2",
          headerClassName
        )}
      >
        {header}
      </div>
      {tableCard}
    </div>
  );
}
