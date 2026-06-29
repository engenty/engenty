import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../../lib/utils";

const settingsFormCardVariants = cva(
  "ui-canvas-panel rounded-lg border-0 bg-card text-foreground",
  {
    variants: {
      variant: {
        /** Default padding for mixed controls (inputs, buttons, tables). */
        default: "p-3 sm:p-4",
        /**
         * Tighter vertical padding when stacking {@link SettingsFormRow} —
         * avoids double-stacking with row-level `py-2`.
         */
        compact: "px-3 py-2 sm:px-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type SettingsFormCardProps = React.ComponentProps<"div"> &
  VariantProps<typeof settingsFormCardVariants>;

/**
 * Bordered settings form surface (canvas panel, card background).
 *
 * - **`variant="default"`** — `p-3 sm:p-4` for general form content.
 * - **`variant="compact"`** — `py-2` + horizontal `px-3 sm:px-4` for
 *   {@link SettingsFormRow} stacks (pair with `divide-y` on the card).
 *
 * Prefer composing through {@link SettingsFormSection}; use this directly only
 * when you need the same chrome without the section title stack.
 */
export function SettingsFormCard({
  className,
  variant,
  ...props
}: SettingsFormCardProps) {
  return (
    <div
      className={cn(settingsFormCardVariants({ variant }), className)}
      data-slot="settings-form-card"
      data-variant={variant ?? "default"}
      {...props}
    />
  );
}
