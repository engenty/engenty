import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import {
  teamModulePageScrollInnerClassName,
  teamModulePageScrollInnerNarrowClassName,
  teamModulePageScrollShellClassName,
} from "../lib/team-page-shell.js";

interface TeamModulePageScrollProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  variant?: "default" | "narrow";
}

export function TeamModulePageScroll({
  children,
  className,
  innerClassName,
  variant = "default",
}: TeamModulePageScrollProps) {
  const innerBase =
    variant === "narrow"
      ? teamModulePageScrollInnerNarrowClassName
      : teamModulePageScrollInnerClassName;

  return (
    <div className={cn(teamModulePageScrollShellClassName, className)}>
      <div className={cn(innerBase, innerClassName)}>{children}</div>
    </div>
  );
}
