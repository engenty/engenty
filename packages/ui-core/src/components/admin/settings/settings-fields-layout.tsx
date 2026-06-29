import type * as React from "react";
import { cn } from "../../../lib/utils";

/**
 * Inset bordered panel for stacked label/value rows (e.g. commercial “Einheiten”).
 * Do not nest inside `SettingsFormSection` — that already provides a form `Card`.
 */
export function SettingsFieldsInset({
  children,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  className?: string;
  /** Width + vertical rhythm for rows inside the inset (default matches commercial units). */
  contentClassName?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
    >
      <div className="p-4">
        <div className={cn("max-w-2xl space-y-2", contentClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Column titles above a block of field rows (muted, compact). */
export function SettingsFieldsHeaderRow({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-1 text-muted-foreground text-xs",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** One horizontal row of inputs / controls (flex, gap-1.5). */
export function SettingsFieldsDataRow({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-1.5", className)} {...props}>
      {children}
    </div>
  );
}

/** Trailing slot for lock icon or icon-only row actions (fixed 7×7 tap target). */
export function SettingsFieldsRowEndSlot({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Muted column label inside a CSS grid (knowledge-base property table, etc.). */
export const settingsFieldsColumnHeaderClass =
  "min-w-0 break-words text-muted-foreground text-xs leading-tight";

/** Editable `Input` inside a settings field row. */
export const settingsFieldsEditableInputClass = "h-8 text-sm";

/** Locked/disabled row inputs (matches commercial built-in units). */
export const settingsFieldsLockedInputClass = "h-8 bg-muted text-sm";
