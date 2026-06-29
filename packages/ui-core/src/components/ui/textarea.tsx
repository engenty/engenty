import * as React from "react";
import { formFieldRadiusClassName } from "../../lib/form-field-chrome";
import { focusVisibleRingSubtle } from "../../lib/focus-visible";
import { cn } from "../../lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "ui-canvas-field flex min-h-[80px] w-full min-w-0 bg-card px-3 py-2 text-sm outline-none transition-[box-shadow,border-color] md:text-sm",
        formFieldRadiusClassName,
        "placeholder:text-muted-foreground/60",
        focusVisibleRingSubtle,
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "resize-y",
        className
      )}
      data-slot="textarea"
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
