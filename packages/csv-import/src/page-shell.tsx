import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";

/**
 * Scroll shell for import routes inside `CopilotShellMain` (`overflow-hidden` parent).
 * Apply on the page root — not on the wizard alone.
 */
export const importPageScrollShellClassName =
  "flex min-h-0 flex-1 flex-col overflow-y-auto p-page pb-scroll-safe";

/** Centered wizard column on wide mapping layouts. */
export const importPageContentClassName = "mx-auto w-full max-w-6xl";

export interface ImportPageShellProps {
  children: ReactNode;
  className?: string;
}

export function ImportPageShell({ children, className }: ImportPageShellProps) {
  return (
    <section className={cn(importPageScrollShellClassName, className)}>
      {children}
    </section>
  );
}
