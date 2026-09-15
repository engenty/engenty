"use client";

/**
 * The `window` dock mode: the full copilot panel as a draggable, resizable
 * window over the page. The sidebar reserves a column and the drawer covers
 * the right edge; this one floats where the person puts it, so a record and
 * the conversation about it can sit side by side at any size.
 *
 * Position and size persist in the layout snapshot (`windowRect`) and are
 * clamped to the viewport on every render — a window saved on a wide monitor
 * reopens inside a laptop screen instead of off its edge.
 */

import type {
  CopilotLayoutPersistence,
  CopilotWindowRect,
} from "@engenty/app-shell";
import { cn } from "@engenty/ui-core";
import type {
  ReactNode,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export const COPILOT_WINDOW_MIN_WIDTH = 360;
export const COPILOT_WINDOW_MIN_HEIGHT = 320;
const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 680;
const VIEWPORT_MARGIN = 12;
/** Enough of the title bar stays reachable to drag the window back. */
const MIN_VISIBLE = 80;

type ResizeEdge = "e" | "n" | "ne" | "nw" | "s" | "se" | "sw" | "w";

const RESIZE_EDGES: readonly {
  className: string;
  cursor: string;
  edge: ResizeEdge;
}[] = [
  { className: "inset-x-2 -top-1 h-2", cursor: "ns-resize", edge: "n" },
  { className: "inset-x-2 -bottom-1 h-2", cursor: "ns-resize", edge: "s" },
  { className: "inset-y-2 -left-1 w-2", cursor: "ew-resize", edge: "w" },
  { className: "inset-y-2 -right-1 w-2", cursor: "ew-resize", edge: "e" },
  { className: "-top-1 -left-1 size-3", cursor: "nwse-resize", edge: "nw" },
  { className: "-top-1 -right-1 size-3", cursor: "nesw-resize", edge: "ne" },
  { className: "-bottom-1 -left-1 size-3", cursor: "nesw-resize", edge: "sw" },
  {
    className: "-right-1 -bottom-1 size-3",
    cursor: "nwse-resize",
    edge: "se",
  },
];

function viewport(): { height: number; width: number } {
  if (typeof window === "undefined") {
    return { height: 900, width: 1440 };
  }
  return { height: window.innerHeight, width: window.innerWidth };
}

/** Default: bottom-right, the corner the launcher and the FAB live in. */
export function defaultCopilotWindowRect(): CopilotWindowRect {
  const view = viewport();
  const width = Math.min(DEFAULT_WIDTH, view.width - VIEWPORT_MARGIN * 2);
  const height = Math.min(DEFAULT_HEIGHT, view.height - VIEWPORT_MARGIN * 2);
  return {
    height,
    width,
    x: view.width - width - VIEWPORT_MARGIN,
    y: view.height - height - VIEWPORT_MARGIN,
  };
}

/** Keep the window usable on THIS screen: never smaller than the minimum,
 *  never larger than the viewport, and always with a grabbable strip inside. */
export function clampCopilotWindowRect(
  rect: CopilotWindowRect
): CopilotWindowRect {
  const view = viewport();
  const width = Math.max(
    COPILOT_WINDOW_MIN_WIDTH,
    Math.min(rect.width, view.width - VIEWPORT_MARGIN * 2)
  );
  const height = Math.max(
    COPILOT_WINDOW_MIN_HEIGHT,
    Math.min(rect.height, view.height - VIEWPORT_MARGIN * 2)
  );
  const x = Math.max(
    MIN_VISIBLE - width,
    Math.min(rect.x, view.width - MIN_VISIBLE)
  );
  const y = Math.max(0, Math.min(rect.y, view.height - MIN_VISIBLE));
  return { height, width, x, y };
}

function sameRect(a: CopilotWindowRect, b: CopilotWindowRect): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

interface DragState {
  edge: ResizeEdge | "move";
  start: CopilotWindowRect;
  startX: number;
  startY: number;
}

function applyDrag(
  drag: DragState,
  clientX: number,
  clientY: number
): CopilotWindowRect {
  const dx = clientX - drag.startX;
  const dy = clientY - drag.startY;
  const { start } = drag;
  if (drag.edge === "move") {
    return { ...start, x: start.x + dx, y: start.y + dy };
  }
  let { x, y, width, height } = start;
  if (drag.edge.includes("e")) {
    width = Math.max(COPILOT_WINDOW_MIN_WIDTH, start.width + dx);
  }
  if (drag.edge.includes("s")) {
    height = Math.max(COPILOT_WINDOW_MIN_HEIGHT, start.height + dy);
  }
  if (drag.edge.includes("w")) {
    width = Math.max(COPILOT_WINDOW_MIN_WIDTH, start.width - dx);
    x = start.x + (start.width - width);
  }
  if (drag.edge.includes("n")) {
    height = Math.max(COPILOT_WINDOW_MIN_HEIGHT, start.height - dy);
    y = start.y + (start.height - height);
  }
  return { height, width, x, y };
}

export interface CopilotWindowSurfaceProps {
  children: ReactNode;
  /** Layout persistence; the rect round-trips through `windowRect`. */
  copilotLayout: CopilotLayoutPersistence | null;
  dragHandleLabel: string;
  surfaceInstanceKey: string;
  title: string | undefined;
  /** The panel's own header lives inside `children`; this bar only drags. */
  titleBarRef?: RefObject<HTMLDivElement | null>;
}

export function CopilotWindowSurface({
  children,
  copilotLayout,
  dragHandleLabel,
  surfaceInstanceKey,
  title,
  titleBarRef,
}: CopilotWindowSurfaceProps) {
  const [rect, setRect] = useState<CopilotWindowRect>(() =>
    clampCopilotWindowRect(
      copilotLayout?.snapshot?.windowRect ?? defaultCopilotWindowRect()
    )
  );
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const mergeLayout = copilotLayout?.mergeLayout;

  // A resize of the browser window pulls the copilot window back inside it.
  useEffect(() => {
    const onResize = () => {
      setRect((current) => {
        const next = clampCopilotWindowRect(current);
        return sameRect(current, next) ? current : next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      setRect(
        clampCopilotWindowRect(applyDrag(drag, event.clientX, event.clientY))
      );
    };
    const onUp = () => {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
      setDragging(false);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      mergeLayout?.({ windowRect: rectRef.current });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [mergeLayout]);

  const beginDrag = useCallback(
    (edge: DragState["edge"], cursor: string) =>
      (event: ReactPointerEvent<HTMLElement>) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        dragRef.current = {
          edge,
          start: rectRef.current,
          startX: event.clientX,
          startY: event.clientY,
        };
        setDragging(true);
        document.body.style.setProperty("cursor", cursor);
        document.body.style.setProperty("user-select", "none");
      },
    []
  );

  return (
    <div
      aria-label={title ?? "Copilot window"}
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground",
        dragging ? "shadow-2xl" : "shadow-xl transition-shadow"
      )}
      data-copilot-drawer-panel
      data-copilot-speech-scope
      data-copilot-window
      key={`window:${surfaceInstanceKey}`}
      role="dialog"
      style={{
        height: rect.height,
        left: rect.x,
        top: rect.y,
        width: rect.width,
      }}
    >
      {/* The whole top strip drags — the panel header renders its own
          controls inside `children`, so this bar stays thin and empty. */}
      <div
        aria-label={dragHandleLabel}
        className="flex h-2 shrink-0 cursor-grab touch-none items-center justify-center bg-muted/40 active:cursor-grabbing"
        onPointerDown={beginDrag("move", "grabbing")}
        ref={titleBarRef}
        role="presentation"
      >
        <span className="h-1 w-10 rounded-full bg-border" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      {RESIZE_EDGES.map((handle) => (
        <div
          aria-hidden
          className={cn("absolute z-10 touch-none", handle.className)}
          key={handle.edge}
          onPointerDown={beginDrag(handle.edge, handle.cursor)}
          style={{ cursor: handle.cursor }}
        />
      ))}
    </div>
  );
}
