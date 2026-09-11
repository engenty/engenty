import type * as React from "react";

import { cn } from "../../../lib/utils";

/**
 * Wrap visible labels for app topbar actions registered via `usePageConfig`.
 * Below `md`, the label is visually hidden but remains available to screen readers
 * while icons stay visible.
 */
export function TopbarActionLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      {...props}
      className={cn("max-md:sr-only md:not-sr-only", className)}
    />
  );
}

/**
 * Use on simple topbar `Button`s (icon + `TopbarActionLabel`) so the control
 * reads as a compact icon button below `md`. Omit on wide controls (e.g. menu triggers
 * with multiple icons).
 */
export const topbarIconButtonClassName =
  "max-md:size-8 max-md:gap-0 max-md:px-0 max-md:[&_svg]:m-0";

/**
 * Compact topbar controls for reader pages (the default transparent topbar): same density as
 * settings header actions (`size="sm"` + `text-xs` + 3.5 icons) — pairs with `variant="ghost"`.
 */
export const readerBlendTopbarWorkflowButtonClassName = cn(
  topbarIconButtonClassName,
  "h-7 min-h-7 gap-1 px-2 font-normal text-xs shadow-none",
  "[&_svg]:size-3.5 [&_svg]:shrink-0",
  "max-md:h-8 max-md:w-8 max-md:min-w-0 max-md:px-0"
);
