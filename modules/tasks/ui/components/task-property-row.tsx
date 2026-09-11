import { cn } from "@engenty/ui-core";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

export const taskPropertyRowClassName =
  "ui-card-raised flex w-full items-center gap-2.5 px-3 py-2.5 text-left";

interface TaskPropertyRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  disabled?: boolean;
  icon: LucideIcon;
  interactive?: boolean;
  label?: string;
  ref?: Ref<HTMLDivElement>;
  showChevron?: boolean;
  trailing?: ReactNode;
}

export function TaskPropertyRow({
  icon: Icon,
  label,
  children,
  interactive = false,
  showChevron = false,
  trailing,
  disabled = false,
  className,
  ref,
  ...props
}: TaskPropertyRowProps) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        taskPropertyRowClassName,
        interactive &&
          !disabled &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      ref={ref}
      role={interactive ? "button" : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      {...props}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
        {label ? (
          <span className="truncate text-muted-foreground text-sm">
            {label}
          </span>
        ) : (
          <span />
        )}
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span className="min-w-0 text-right">{children}</span>
          {trailing}
          {showChevron ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/70" />
          ) : null}
        </span>
      </span>
    </div>
  );
}

export function TaskPropertyEmpty({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground/70 text-sm">{children}</span>;
}
