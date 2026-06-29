"use client";

import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";

export interface AdminListPaginationProps {
  nextLabel: string;
  onNext: () => void;
  onPrevious: () => void;
  page: number;
  /** Extra classes for the page indicator (e.g. tabular-nums). */
  pageOfClassName?: string;
  pageOfLabel: string;
  previousLabel: string;
  totalPages: number;
}

export function AdminListPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  pageOfLabel,
  pageOfClassName,
}: AdminListPaginationProps) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2">
      <Button
        disabled={page <= 1}
        onClick={onPrevious}
        size="sm"
        variant="outline"
      >
        {previousLabel}
      </Button>
      <span className={cn("text-muted-foreground text-xs", pageOfClassName)}>
        {pageOfLabel}
      </span>
      <Button
        disabled={page >= totalPages}
        onClick={onNext}
        size="sm"
        variant="outline"
      >
        {nextLabel}
      </Button>
    </div>
  );
}
