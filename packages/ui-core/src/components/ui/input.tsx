import type * as React from "react";
import { formFieldSingleLineMetricsClassName } from "../../lib/form-field-chrome";
import { focusVisibleRingSubtle } from "../../lib/focus-visible";
import { cn } from "../../utils";

function Input({
  className,
  type = "text",
  ref,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "ui-canvas-field flex w-full min-w-0 bg-card px-2.5 py-1.5 text-sm outline-none transition-[box-shadow,border-color] md:text-sm",
        formFieldSingleLineMetricsClassName,
        "placeholder:text-muted-foreground/60",
        focusVisibleRingSubtle,
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      data-slot="input"
      ref={ref}
      type={type}
      {...props}
    />
  );
}

export { Input };
