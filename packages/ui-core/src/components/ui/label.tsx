import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const labelVariants = cva(
  "flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
);

function Label({
  className,
  ...props
}: React.ComponentProps<"label"> & VariantProps<typeof labelVariants>) {
  return (
    <label
      className={cn(labelVariants(), className)}
      data-slot="label"
      {...props}
    />
  );
}

export { Label };
