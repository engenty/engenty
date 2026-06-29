import { AnimatedLoaderIcon } from "@engenty/ui-icons"

import { cn } from "../../lib/utils"

function Spinner({
  className,
  ...props
}: Omit<React.ComponentProps<typeof AnimatedLoaderIcon>, "play" | "label">) {
  return (
    <span
      aria-label="Loading"
      className="inline-flex items-center justify-center"
      role="status"
    >
      <AnimatedLoaderIcon
        className={cn(className)}
        play="always"
        size="sm"
        {...props}
      />
    </span>
  )
}

export { Spinner }
