import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";

interface DocumentHeaderProps {
  children: ReactNode;
  className?: string;
  /**
   * When true, collapse to a single sticky line: the compact status +
   * a smaller title. The full stack (eyebrow, large title, stepper) fades.
   * Drive from a scroll detector on the page's scroll container.
   */
  collapsed?: boolean;
  /** Compact status (e.g. a badge) shown on the collapsed line. */
  compactStatus?: ReactNode;
  /** Smaller title shown on the collapsed line. */
  compactTitle?: ReactNode;
}

export function DocumentHeader({
  children,
  className,
  collapsed = false,
  compactTitle,
  compactStatus,
}: DocumentHeaderProps) {
  return (
    // Blended header: the white surface extends up under the transparent
    // floating topbar so the two read as one band. Pair with the page's
    // `usePageConfig({ topbarChrome: "contentBlend", topbarOverlap: true })`.
    // `pt-14` keeps the content clear of the ~44px (h-11) topbar.
    <div className={cn("w-full border-border border-b bg-card", className)}>
      <div className="mx-auto w-full max-w-6xl px-2 pt-14 pb-4 sm:px-4">
        {/* Full stack ↔ compact line cross-fade. Each region is a single-row
            grid whose height animates between 0fr and 1fr (content height);
            transitioning both at once morphs the header height with no JS
            measurement. */}
        <div
          aria-hidden={collapsed}
          className={cn(
            "grid transition-all duration-300 ease-out",
            collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div
            className={cn(
              "min-h-0 overflow-hidden",
              collapsed && "pointer-events-none"
            )}
          >
            <div className="flex flex-col gap-2">{children}</div>
          </div>
        </div>
        <div
          aria-hidden={!collapsed}
          className={cn(
            "grid transition-all duration-300 ease-out",
            collapsed
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div
            className={cn(
              "min-h-0 overflow-hidden",
              !collapsed && "pointer-events-none"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {compactStatus ? (
                <div className="shrink-0">{compactStatus}</div>
              ) : null}
              <span className="min-w-0 truncate font-heading font-semibold text-foreground text-xl leading-tight tracking-tight">
                {compactTitle}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
