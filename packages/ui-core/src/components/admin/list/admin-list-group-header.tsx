import { ChevronDown } from "lucide-react";
import type * as React from "react";

import { focusVisibleRingSubtle } from "../../../lib/focus-visible";
import { cn } from "../../../lib/utils";
import { Badge } from "../../ui/badge";

export interface AdminListGroupHeaderProps {
  /** Label content — typically an {@link AdminListGroupPill}. */
  children: React.ReactNode;
  className?: string;
  /** Muted trailing text, e.g. "13 skills". */
  count?: React.ReactNode;
  onToggle: () => void;
  /** Whether the group this header controls is expanded. */
  open: boolean;
  /**
   * Optional leading slot rendered before the toggle — e.g. a bulk-select
   * checkbox for the group. Kept outside the toggle button so interacting
   * with it doesn't collapse/expand the group.
   */
  selection?: React.ReactNode;
  /** Accessible label for the collapse/expand toggle. */
  toggleLabel?: string;
}

/**
 * Collapsible group header for admin lists/cards — chevron + label slot + count.
 * The engenty standard divider for grouped lists (replaces a plain border-bottom).
 * Drop an {@link AdminListGroupPill} (or a domain status badge) in as the label.
 *
 * @example
 * <AdminListGroupHeader count={`${n} skills`} onToggle={toggle} open={open}>
 *   <AdminListGroupPill>{moduleId}</AdminListGroupPill>
 * </AdminListGroupHeader>
 */
export function AdminListGroupHeader({
  children,
  className,
  count,
  open,
  onToggle,
  selection,
  toggleLabel,
}: AdminListGroupHeaderProps) {
  return (
    <div
      className={cn("flex items-center py-2", className)}
      data-slot="admin-list-group-header"
    >
      {selection == null ? null : (
        <span className="mr-2 flex shrink-0 items-center">{selection}</span>
      )}
      <button
        aria-expanded={open}
        aria-label={toggleLabel}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded text-left font-semibold text-foreground transition-opacity hover:opacity-85",
          focusVisibleRingSubtle
        )}
        onClick={onToggle}
        type="button"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open ? "" : "-rotate-90"
          )}
        />
        {children}
        {count == null ? null : (
          <span className="font-normal text-muted-foreground text-xs tabular-nums">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

export interface AdminListGroupPillProps
  extends React.ComponentProps<typeof Badge> {
  /** Show the leading status-style dot (inherits the pill text color). */
  dot?: boolean;
}

/**
 * Rounded label pill for {@link AdminListGroupHeader}. Neutral by default;
 * pass a tone via `className` (e.g. text/bg color) for status-coloured groups.
 */
export function AdminListGroupPill({
  children,
  className,
  dot = true,
  ...props
}: AdminListGroupPillProps) {
  return (
    <Badge
      className={cn(
        "inline-flex min-w-0 max-w-full items-center font-normal",
        className
      )}
      variant="secondary"
      {...props}
    >
      {dot ? (
        <span className="mr-1.5 inline-block size-1.5 shrink-0 rounded-full bg-current opacity-60" />
      ) : null}
      <span className="truncate">{children}</span>
    </Badge>
  );
}
