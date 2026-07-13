import { cn } from "@engenty/ui-core";
import { X } from "lucide-react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Pane primitives — the Workspace/Pane model from
 * `docs/wip/app-shell-unification.md`. A Pane is a typed unit with its own
 * top bar (homogeneous tabs + controls) and content; a PaneGroup lays panes
 * out side by side on the page canvas. Consumers pair PaneResizeHandle with
 * `usePersistedEwResizePaneWidth` for a persisted split.
 */

export function PaneGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

export interface PaneProps {
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  topBar?: ReactNode;
}

/** One pane: a rounded card surface with an optional top bar. */
export function Pane({
  "aria-label": ariaLabel,
  children,
  className,
  style,
  topBar,
}: PaneProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "ui-canvas-elevated flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-card",
        className
      )}
      style={style}
    >
      {topBar}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </section>
  );
}

export function PaneTopBar({
  actions,
  children,
  className,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-10 shrink-0 items-center gap-1 border-border/60 border-b px-1.5",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </header>
  );
}

export interface PaneTabItem {
  icon?: ReactNode;
  id: string;
  label: string;
}

export interface PaneTabStripProps {
  activeId: string | null;
  className?: string;
  /** aria-label for a tab's close button; required when onClose is set. */
  closeLabel?: string;
  items: PaneTabItem[];
  onActivate: (id: string) => void;
  onClose?: (id: string) => void;
}

/**
 * Homogeneous tab strip for a pane's top bar — every tab holds the pane's
 * kind of content (artifact tabs in an Artifact Pane, chat tabs in a Chat
 * Pane); kinds are never mixed within one strip.
 */
export function PaneTabStrip({
  activeId,
  className,
  closeLabel,
  items,
  onActivate,
  onClose,
}: PaneTabStripProps) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-0.5", className)}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <span
            className={cn(
              "group flex min-w-0 shrink-0 items-center rounded-md transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
            key={item.id}
          >
            <button
              aria-selected={active}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-md py-1 pl-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                onClose ? "pr-0.5" : "pr-2"
              )}
              onClick={() => onActivate(item.id)}
              role="tab"
              type="button"
            >
              {item.icon}
              <span className="max-w-44 truncate">{item.label}</span>
            </button>
            {onClose ? (
              <button
                aria-label={`${closeLabel ?? "Close"}: ${item.label}`}
                className={cn(
                  "mr-1 rounded p-0.5 text-muted-foreground/70 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={() => onClose(item.id)}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export interface PaneResizeHandleProps {
  isResizing?: boolean;
  label: string;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

/** East-west drag handle between two panes (same affordance as the shell columns). */
export function PaneResizeHandle({
  isResizing,
  label,
  onKeyDown,
  onPointerDown,
}: PaneResizeHandleProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        "relative h-full w-2 shrink-0 cursor-ew-resize rounded-full bg-transparent transition-colors hover:bg-border/80 focus-visible:bg-border focus-visible:outline-none",
        isResizing && "bg-border"
      )}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      type="button"
    >
      <span className="sr-only">{label}</span>
    </button>
  );
}
