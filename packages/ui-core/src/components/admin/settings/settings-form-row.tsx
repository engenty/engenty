import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";
import { Label } from "../../ui/label";

/** How wide the value slot is within the 1/3 column (controls stay right-aligned). */
export type SettingsFormControlSizing = "compact" | "fit" | "stretch" | "wide";

export interface SettingsFormRowProps {
  children: ReactNode;
  className?: string;
  /**
   * `compact` — short numeric inputs / tight selects (capped width, right-flush).
   * `fit` — intrinsic width (e.g. switches).
   * `wide` — fills the value column (e.g. long selects, truncates).
   * `stretch` — full width of the value column for input + button groups.
   */
  controlSizing?: SettingsFormControlSizing;
  hint?: ReactNode;
  label: ReactNode;
  /** When set, renders a `<Label htmlFor=…>` (accessibility). Otherwise a styled title node. */
  labelFor?: string;
}

/**
 * Settings row: label + optional hint (~2/3), control (~1/3), right-aligned on `sm+`.
 * Compose inside {@link SettingsFormSection} with `cardVariant="compact"` and
 * `cardClassName="space-y-0 divide-y divide-border"` when stacking multiple rows.
 */
export function SettingsFormRow({
  label,
  labelFor,
  hint,
  children,
  className,
  controlSizing = "wide",
}: SettingsFormRowProps) {
  const valueShellClass =
    controlSizing === "fit"
      ? "ms-auto w-auto max-w-full shrink-0"
      : controlSizing === "compact"
        ? "ms-auto w-[11rem] max-w-full shrink-0"
        : controlSizing === "stretch"
          ? "w-full min-w-0 max-w-full"
          : "w-full min-w-0 max-w-full";

  const rowAlignClass =
    hint != null || controlSizing === "stretch"
      ? "sm:items-start"
      : "sm:items-center";

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 gap-3 py-2 sm:grid-cols-12 sm:gap-x-6 sm:gap-y-0",
        rowAlignClass,
        className
      )}
    >
      <div className="min-w-0 sm:col-span-8">
        {labelFor == null ? (
          <div className="font-medium text-foreground text-sm leading-none">
            {label}
          </div>
        ) : (
          <Label className="text-sm leading-none" htmlFor={labelFor}>
            {label}
          </Label>
        )}
        {hint == null ? null : (
          <p className="mt-1.5 text-muted-foreground text-sm leading-snug">
            {hint}
          </p>
        )}
      </div>
      <div className="flex min-w-0 justify-end sm:col-span-4 sm:justify-end">
        <div className={cn("min-w-0", valueShellClass)}>{children}</div>
      </div>
    </div>
  );
}
