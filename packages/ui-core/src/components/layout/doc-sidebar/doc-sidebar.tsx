import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../ui/sheet";
import {
  setDocSidebarMode,
  setDocSidebarOverlayOpen,
  useDocSidebar,
} from "./doc-sidebar-store";
import { useDocSidebarWidth } from "./use-doc-sidebar-width";

/** Minimum inline sidebar content width. */
export const DOC_SIDEBAR_WIDTH_PX = 280;

/** Sidebar may grow a little past the minimum inside a capped document row. */
export const DOC_SIDEBAR_MAX_WIDTH_PX = 340;

/**
 * Upper bound when `resizable` is enabled — room for longer labels/values
 * without dominating the document column.
 */
export const DOC_SIDEBAR_RESIZE_MAX_WIDTH_PX = 520;

/**
 * Space between the document and the inline sidebar. Owned by the layout (not
 * the consumer's `className` gap) so it can collapse together with the sidebar
 * width when the panel animates closed — a residual container gap would leave
 * empty space to the right of a full-width document.
 */
export const DOC_SIDEBAR_GAP_PX = 32;

/**
 * Container width below which the sidebar leaves the inline column and
 * becomes an overlay: 280px sidebar + gap leaves ~500px for the document,
 * the minimum comfortable reading column.
 */
export const DOC_SIDEBAR_INLINE_MIN_WIDTH_PX = 800;

export interface DocSidebarLayoutProps {
  children: ReactNode;
  /**
   * Applied to the centered document+sidebar row (padding, `max-w-*`). Cap the
   * combined row so the main document stays width-limited when the sidebar is
   * open; the sidebar itself is `min`–`max` and may grow slightly inside that.
   */
  className?: string;
  /** Container-width threshold (px) for the inline column. */
  inlineMinWidth?: number;
  /**
   * When true, the sidebar (inline column and overlay sheet) can be drag-
   * resized on its leading edge. Width persists under `${storageKey}:width`.
   */
  resizable?: boolean;
  sidebar: ReactNode;
  /** Labels the sidebar region and titles the overlay sheet. */
  sidebarLabel: string;
  storageKey: string;
}

/**
 * Detail-page layout with a sidebar belonging to the document ("doc
 * sidebar"): properties, settings, metadata. Renders the sidebar as an
 * inline column while the available width allows it, and as a right-side
 * overlay sheet when it does not (narrow viewport, or the page sharing the
 * shell with a docked copilot pane). Visibility is toggled via
 * `DocSidebarToggle` (same `storageKey`), typically registered in the page
 * top bar through `usePageConfig` actions.
 *
 * The inline/overlay decision is measured on a full-width outer wrapper, not
 * on the (`className`-capped) content row — so a page may narrow the visible
 * content when the sidebar is closed without that cap forcing overlay mode.
 * `inlineMinWidth` is compared against the space available to the page,
 * independent of the max-width.
 */
export function DocSidebarLayout({
  children,
  className,
  inlineMinWidth = DOC_SIDEBAR_INLINE_MIN_WIDTH_PX,
  resizable = false,
  sidebar,
  sidebarLabel,
  storageKey,
}: DocSidebarLayoutProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const { mode, open, setOverlayOpen } = useDocSidebar(storageKey);
  const {
    displayedWidthPx,
    handleResizeKeyDown,
    handleResizePointerDown,
    isResizing,
  } = useDocSidebarWidth({
    storageKey,
    defaultPx: DOC_SIDEBAR_WIDTH_PX,
    minPx: DOC_SIDEBAR_WIDTH_PX,
    maxPx: DOC_SIDEBAR_RESIZE_MAX_WIDTH_PX,
  });

  useLayoutEffect(() => {
    const element = measureRef.current;
    if (!element) {
      return;
    }
    const update = () => {
      const width = element.offsetWidth;
      // 0 = not rendered yet (hidden tab, display:none ancestor) — keep the
      // current mode rather than misreading "too narrow".
      if (width === 0) {
        return;
      }
      setDocSidebarMode(
        storageKey,
        width >= inlineMinWidth ? "inline" : "overlay"
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [inlineMinWidth, storageKey]);

  // A stale transient overlay must not reopen on the next detail page.
  useEffect(
    () => () => setDocSidebarOverlayOpen(storageKey, false),
    [storageKey]
  );

  const inlineOpen = mode === "inline" && open;
  const fixedSidebarWidth = resizable ? displayedWidthPx : DOC_SIDEBAR_WIDTH_PX;
  const sidebarMin = fixedSidebarWidth + DOC_SIDEBAR_GAP_PX;
  const sidebarMax = resizable
    ? displayedWidthPx + DOC_SIDEBAR_GAP_PX
    : DOC_SIDEBAR_MAX_WIDTH_PX + DOC_SIDEBAR_GAP_PX;

  const resizeHandle = resizable ? (
    <button
      aria-label="Resize sidebar"
      className="absolute top-0 left-0 z-10 h-full w-2 -translate-x-1/2 cursor-ew-resize rounded-full bg-transparent transition-colors hover:bg-border/80"
      onKeyDown={handleResizeKeyDown}
      onPointerDown={handleResizePointerDown}
      type="button"
    >
      <span className="sr-only">Resize sidebar</span>
    </button>
  ) : null;

  return (
    <div className="w-full" ref={measureRef}>
      <div className={cn("mx-auto flex w-full", className)}>
        <div className="min-w-0 flex-1">{children}</div>
        {mode === "inline" ? (
          // Collapsible inline column: min width with a little room to grow
          // inside the capped row; collapses to 0 with the gap so nothing is
          // left beside a full-width document. `inert` keeps the collapsed
          // panel out of the tab order.
          <div
            aria-hidden={!inlineOpen}
            className={cn(
              "overflow-hidden motion-reduce:transition-none",
              !isResizing &&
                "transition-[min-width,max-width,flex-basis,width] duration-300 ease-in-out",
              !inlineOpen && "pointer-events-none"
            )}
            inert={!inlineOpen}
            style={
              inlineOpen
                ? resizable
                  ? {
                      flex: `0 0 ${sidebarMin}px`,
                      maxWidth: sidebarMax,
                      minWidth: sidebarMin,
                      width: sidebarMin,
                    }
                  : {
                      flex: `1 1 ${sidebarMin}px`,
                      maxWidth: sidebarMax,
                      minWidth: sidebarMin,
                    }
                : {
                    flex: "0 0 0px",
                    maxWidth: 0,
                    minWidth: 0,
                    width: 0,
                  }
            }
          >
            <aside
              aria-label={sidebarLabel}
              className="relative flex h-full w-full min-w-0 flex-col gap-4"
              style={{
                minWidth: fixedSidebarWidth,
                paddingLeft: DOC_SIDEBAR_GAP_PX,
                ...(resizable
                  ? { width: fixedSidebarWidth + DOC_SIDEBAR_GAP_PX }
                  : null),
              }}
            >
              {resizeHandle}
              {sidebar}
            </aside>
          </div>
        ) : null}
        {mode === "overlay" ? (
          <Sheet onOpenChange={setOverlayOpen} open={open}>
            <SheetContent
              // No `relative` here: SheetContent is `fixed`, and tailwind-merge
              // treats the two as conflicting position utilities — passing
              // `relative` silently strips `fixed`, dropping the sheet out of
              // viewport positioning (left-aligned, mid-page, overflowing the
              // bottom). `fixed` already establishes the containing block that
              // the absolutely-positioned resize handle needs.
              className={cn(
                "gap-0 overflow-y-auto",
                resizable ? "w-full sm:max-w-none" : "w-full sm:max-w-sm"
              )}
              side="right"
              style={
                resizable
                  ? { maxWidth: "95vw", width: displayedWidthPx }
                  : undefined
              }
            >
              {resizeHandle}
              <SheetHeader>
                <SheetTitle>{sidebarLabel}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-4 p-4 pt-0">{sidebar}</div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </div>
  );
}

export interface DocSidebarToggleProps {
  className?: string;
  label: string;
  storageKey: string;
  /**
   * Optional visible text shown next to the icon on wider viewports (the
   * icon stays the sole affordance on small screens). `label` remains the
   * accessible name regardless.
   */
  text?: string;
}

/**
 * Icon toggle for a `DocSidebarLayout` with the same `storageKey`. Belongs
 * to the document it sidebars — place it at the right edge of the document
 * header, not in the workspace topbar (that edge hosts pane-level toggles).
 */
export function DocSidebarToggle({
  className,
  label,
  storageKey,
  text,
}: DocSidebarToggleProps) {
  const { open, toggle } = useDocSidebar(storageKey);
  const Icon = open ? PanelRightClose : PanelRightOpen;
  return (
    <Button
      aria-expanded={open}
      aria-label={label}
      className={cn("text-muted-foreground", className)}
      onClick={toggle}
      size={text ? "sm" : "icon-sm"}
      variant="ghost"
    >
      {text ? <span className="mr-1.5 hidden sm:inline">{text}</span> : null}
      <Icon className="size-4" />
    </Button>
  );
}
