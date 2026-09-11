import { cn } from "@engenty/ui-core";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Pane primitives — the Workspace/Pane model from
 * `docs/wip/app-shell-unification.md`. A Pane is a typed unit with its own
 * top bar (its chooser + controls) and content; a PaneGroup lays panes
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
        "ui-card-elevated flex min-h-0 min-w-0 flex-col overflow-hidden",
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
        "flex h-10 shrink-0 items-center gap-1 border-border-soft border-b px-1.5",
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
