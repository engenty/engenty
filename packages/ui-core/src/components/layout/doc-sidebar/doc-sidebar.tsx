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

export const DOC_SIDEBAR_WIDTH_PX = 280;

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
  className?: string;
  /** Container-width threshold (px) for the inline column. */
  inlineMinWidth?: number;
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
 * on the (`className`-capped) content column — so a page may narrow the
 * visible content when the sidebar is closed without that cap forcing the
 * layout into overlay mode. `inlineMinWidth` is therefore compared against
 * the space actually available to the page, independent of the max-width.
 */
export function DocSidebarLayout({
  children,
  className,
  inlineMinWidth = DOC_SIDEBAR_INLINE_MIN_WIDTH_PX,
  sidebar,
  sidebarLabel,
  storageKey,
}: DocSidebarLayoutProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const { mode, open, setOverlayOpen } = useDocSidebar(storageKey);

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

  return (
    <div className="w-full" ref={measureRef}>
      <div className={cn("mx-auto flex w-full", className)}>
        <div className="min-w-0 flex-1">{children}</div>
        {mode === "inline" ? (
          // Collapsible inline column: the wrapper animates its width between
          // 0 and the panel width; overflow-hidden clips the panel while it
          // slides in/out. The gap lives inside (as the panel's left padding
          // plus min-width) so it vanishes with the width instead of leaving a
          // container gap behind. `inert` keeps the collapsed panel out of the
          // tab order.
          <div
            aria-hidden={!inlineOpen}
            className={cn(
              "shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
              !inlineOpen && "pointer-events-none"
            )}
            inert={!inlineOpen}
            style={{
              width: inlineOpen ? DOC_SIDEBAR_WIDTH_PX + DOC_SIDEBAR_GAP_PX : 0,
            }}
          >
            <aside
              aria-label={sidebarLabel}
              className="flex flex-col gap-4"
              style={{
                minWidth: DOC_SIDEBAR_WIDTH_PX + DOC_SIDEBAR_GAP_PX,
                paddingLeft: DOC_SIDEBAR_GAP_PX,
              }}
            >
              {sidebar}
            </aside>
          </div>
        ) : null}
        {mode === "overlay" ? (
          <Sheet onOpenChange={setOverlayOpen} open={open}>
            <SheetContent
              className="w-full gap-0 overflow-y-auto sm:max-w-sm"
              side="right"
            >
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
