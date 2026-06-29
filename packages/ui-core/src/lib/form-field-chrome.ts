/**
 * Styleguide: single-line text fields and aligned controls (input, select trigger,
 * date trigger, input group shell, number stepper).
 *
 * - Border radius: **4px** (`rounded-[4px]`).
 * - Height: Tailwind **`h-8`** / **`min-h-8`** (32px).
 */
export const formFieldRadiusClassName = "rounded-[4px]" as const;

export const formFieldSingleLineHeightClassName = "h-8 min-h-8" as const;

/** Combined height + corner radius for `Input` and similar. */
export const formFieldSingleLineMetricsClassName =
  "h-8 min-h-8 rounded-[4px]" as const;
