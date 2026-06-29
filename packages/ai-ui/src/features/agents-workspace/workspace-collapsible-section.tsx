import { cn } from "@engenty/ui-core";
import { ChevronDown, FolderPlus } from "lucide-react";
import type { ReactNode } from "react";

export function WorkspaceCollapsibleSection({
  addAriaLabel,
  children,
  collapseAriaLabel,
  expandAriaLabel,
  lockOpen = false,
  onAdd,
  onOpenChange,
  onTitleClick,
  open,
  title,
}: {
  addAriaLabel?: string;
  children: ReactNode;
  collapseAriaLabel: string;
  expandAriaLabel: string;
  /** When true, content stays visible and expand/collapse controls are hidden (e.g. catalog search). */
  lockOpen?: boolean;
  onAdd?: () => void;
  onOpenChange: (next: boolean) => void;
  onTitleClick?: () => void;
  open: boolean;
  title: string;
}) {
  const effectiveOpen = lockOpen || open;
  return (
    <div className="mb-1">
      <div className="group flex h-7 items-center gap-0.5 rounded-sm px-1 py-0.5 hover:bg-muted/40">
        <button
          aria-expanded={effectiveOpen}
          className="min-w-0 flex-1 truncate rounded-sm px-0.5 text-left font-semibold text-foreground/85 text-xs tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            if (onTitleClick) {
              onTitleClick();
              return;
            }
            if (!lockOpen) {
              onOpenChange(!open);
            }
          }}
          type="button"
        >
          {title}
        </button>
        <div
          className={cn(
            "flex shrink-0 items-center gap-px transition-opacity duration-150",
            lockOpen
              ? "opacity-100"
              : "opacity-100 focus-within:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
          )}
        >
          {onAdd && addAriaLabel ? (
            <button
              aria-label={addAriaLabel}
              className={cn(
                "flex size-6 items-center justify-center rounded-md",
                "text-muted-foreground hover:bg-muted/90 hover:text-foreground",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              type="button"
            >
              <FolderPlus aria-hidden className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          {lockOpen ? null : (
            <button
              aria-expanded={open}
              aria-label={open ? collapseAriaLabel : expandAriaLabel}
              className={cn(
                "flex size-6 items-center justify-center rounded-md",
                "text-muted-foreground hover:bg-muted/90 hover:text-foreground",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(!open);
              }}
              type="button"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform duration-200 ease-out",
                  open ? "rotate-0" : "-rotate-90"
                )}
                strokeWidth={1.75}
              />
            </button>
          )}
        </div>
      </div>
      {effectiveOpen ? <div className="pt-px">{children}</div> : null}
    </div>
  );
}
