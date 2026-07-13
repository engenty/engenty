import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../ui/sheet";
import { topbarIconButtonClassName } from "../shell/topbar-action-label";
import {
  setDocSidebarMode,
  setDocSidebarOverlayOpen,
  useDocSidebar,
} from "./doc-sidebar-store";

export const DOC_SIDEBAR_WIDTH_PX = 280;

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
 * inline column while the layout's own width allows it, and as a right-side
 * overlay sheet when it does not (narrow viewport, or the page sharing the
 * shell with a docked copilot pane). Visibility is toggled via
 * `DocSidebarToggle` (same `storageKey`), typically registered in the page
 * top bar through `usePageConfig` actions.
 */
export function DocSidebarLayout({
  children,
  className,
  inlineMinWidth = DOC_SIDEBAR_INLINE_MIN_WIDTH_PX,
  sidebar,
  sidebarLabel,
  storageKey,
}: DocSidebarLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { mode, open, setOverlayOpen } = useDocSidebar(storageKey);

  useLayoutEffect(() => {
    const element = containerRef.current;
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
    <div
      className={cn("mx-auto grid w-full gap-4", className)}
      ref={containerRef}
      style={
        inlineOpen
          ? {
              gridTemplateColumns: `minmax(0,1fr) ${DOC_SIDEBAR_WIDTH_PX}px`,
            }
          : undefined
      }
    >
      <div className="min-w-0">{children}</div>
      {inlineOpen ? (
        <aside
          aria-label={sidebarLabel}
          className="flex min-w-0 flex-col gap-4"
        >
          {sidebar}
        </aside>
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
  );
}

export interface DocSidebarToggleProps {
  className?: string;
  label: string;
  storageKey: string;
}

/**
 * Icon toggle for a `DocSidebarLayout` with the same `storageKey`. Sits in
 * the page top bar's action area (right edge), like a pane's sidebar toggle.
 */
export function DocSidebarToggle({
  className,
  label,
  storageKey,
}: DocSidebarToggleProps) {
  const { open, toggle } = useDocSidebar(storageKey);
  const Icon = open ? PanelRightClose : PanelRightOpen;
  return (
    <Button
      aria-expanded={open}
      aria-label={label}
      className={cn(topbarIconButtonClassName, className)}
      onClick={toggle}
      size="sm"
      variant="outline"
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
