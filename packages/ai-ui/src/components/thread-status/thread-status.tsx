// Single status→icon/color mapping for agent threads, shared by the copilot
// thread list, the agents-workspace admin views, and headers. Labels are
// caller-supplied so each surface keeps its own i18n.

import { cn } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { AlertCircle, Check, Clock3, Pencil } from "lucide-react";
import type { AppsAiThreadStatus } from "../../ag-ui/apps-ai/apps-ai-thread-api.js";

export type ThreadStatusIconSize = "sm" | "md";

export interface ThreadStatusIconProps {
  className?: string;
  /** Accessible label for the status (caller-translated). */
  label?: string;
  size?: ThreadStatusIconSize;
  status: AppsAiThreadStatus;
}

const iconSizeClassName: Record<ThreadStatusIconSize, string> = {
  md: "size-3.5",
  sm: "size-3",
};

export function ThreadStatusIcon({
  className,
  label,
  size = "sm",
  status,
}: ThreadStatusIconProps) {
  const sizeClassName = iconSizeClassName[size];
  if (status === "running") {
    return (
      <AnimatedLoaderIcon
        aria-label={label}
        className={className}
        play="always"
        size={size === "sm" ? "sm" : "xs"}
      />
    );
  }
  if (status === "draft") {
    return (
      <Pencil
        aria-label={label}
        className={cn(sizeClassName, "shrink-0 text-primary", className)}
      />
    );
  }
  if (status === "waiting") {
    return (
      <Clock3
        aria-label={label}
        className={cn(sizeClassName, "shrink-0 text-amber-600", className)}
      />
    );
  }
  if (status === "failed") {
    return (
      <AlertCircle
        aria-label={label}
        className={cn(sizeClassName, "shrink-0 text-destructive", className)}
      />
    );
  }
  if (status === "completed") {
    return (
      <span
        aria-label={label}
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white",
          className
        )}
        role="img"
      >
        <Check className="size-2.5 stroke-[3]" />
      </span>
    );
  }
  return (
    <span
      aria-label={label}
      className={cn(
        sizeClassName,
        "shrink-0 rounded-full border border-muted-foreground/35",
        className
      )}
      role="img"
    />
  );
}

const badgeClassNames: Record<AppsAiThreadStatus, string> = {
  completed:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  draft: "border-transparent bg-primary/10 text-primary",
  failed:
    "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  idle: "border-transparent bg-secondary text-secondary-foreground",
  running:
    "border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  waiting:
    "border-transparent bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
};

export function threadStatusBadgeClassName(status: AppsAiThreadStatus): string {
  return badgeClassNames[status] ?? badgeClassNames.idle;
}
