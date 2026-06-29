import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "../../lib/utils";

type CheckboxProps = Omit<
  CheckboxPrimitive.Root.Props,
  "checked" | "onCheckedChange" | "indeterminate"
> & {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
};

function Checkbox({
  className,
  checked,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  const indeterminate = checked === "indeterminate";
  const resolvedChecked = indeterminate ? false : checked;

  return (
    <CheckboxPrimitive.Root
      checked={resolvedChecked}
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-[border-color,box-shadow] outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/35 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary",
        className,
      )}
      data-slot="checkbox"
      indeterminate={indeterminate}
      onCheckedChange={(next) => {
        onCheckedChange?.(next);
      }}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
        data-slot="checkbox-indicator"
      >
        {indeterminate ? <MinusIcon /> : <CheckIcon />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
